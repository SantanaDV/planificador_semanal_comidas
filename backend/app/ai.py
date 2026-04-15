from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any
from unicodedata import combining, normalize as unicode_normalize
from urllib.parse import urlparse

import httpx

from .config import settings
from .demo_fallback import DAYS, MEAL_TYPES, build_replacement_item, build_weekly_menu
from .logging_service import record_exception, record_log

RecipePayload = dict[str, Any]
MenuPayload = dict[str, Any]
GenerationContext = dict[str, Any]
ValidationReport = dict[str, Any]

HTTP_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 MenuPlan/1.0"
)
EXPECTED_WEEKLY_ITEMS = len(DAYS) * len(MEAL_TYPES)


class WeeklyMenuResolutionError(Exception):
    def __init__(self, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.context = context or {}


def generate_weekly_menu(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> MenuPayload:
    prompt = _build_weekly_prompt(ingredients, generation_context)
    payload, call_meta = _call_gemini_with_meta(prompt, use_google_search=False, timeout_seconds=35)
    _annotate_weekly_recipe_sources(payload, settings.gemini_model)
    report = _validate_weekly_payload(payload, ingredients, generation_context)
    if report["all_valid"]:
        return _build_ai_weekly_response(payload, retried=False)

    if payload is None:
        return _build_full_fallback_weekly_response(
            ingredients,
            generation_context,
            reason=_fallback_reason_from_call_status(call_meta.get("status")),
            report=report,
            retry_used=False,
        )

    _log_weekly_validation_failure(report, attempt="initial")
    retry_prompt = _build_weekly_retry_prompt(ingredients, generation_context, report)
    retry_payload, retry_meta = _call_gemini_with_meta(retry_prompt, use_google_search=False, timeout_seconds=30)
    _annotate_weekly_recipe_sources(retry_payload, settings.gemini_model)
    retry_report = _validate_weekly_payload(retry_payload, ingredients, generation_context)

    if retry_report["all_valid"]:
        record_log(
            "info",
            "ai",
            "La reparacion semanal de Gemini devolvio un menu valido",
            {
                "attempt": "retry",
                "item_count": retry_report["item_count"],
                "accepted_count": retry_report["accepted_count"],
            },
        )
        return _build_ai_weekly_response(retry_payload, retried=True)

    if retry_payload is None:
        record_log(
            "warning",
            "ai",
            "La reparacion semanal de Gemini no devolvio payload; se evaluara degradacion parcial",
            {
                "attempt": "retry",
                "call_status": retry_meta.get("status"),
                "invalid_indices": report["invalid_indices"],
            },
        )
    else:
        _log_weekly_validation_failure(retry_report, attempt="retry")

    repaired_menu = _repair_weekly_slots_with_ai(
        ingredients,
        generation_context,
        initial_payload=payload,
        initial_report=report,
        retry_payload=retry_payload,
        retry_report=retry_report,
    )

    if repaired_menu["unresolved_count"] == 0:
        record_log(
            "info",
            "ai",
            "Menu semanal completado con reparacion dirigida por slots IA",
            {
                "repaired_item_count": repaired_menu["repaired_item_count"],
                "slot_attempt_count": repaired_menu["slot_attempt_count"],
            },
        )
        return _build_ai_weekly_response(
            {"items": repaired_menu["items"]},
            retried=True,
            repaired_slots=repaired_menu["repaired_item_count"],
        )

    unresolved_context = {
        "unresolved_indices": repaired_menu["unresolved_indices"],
        "repaired_item_count": repaired_menu["repaired_item_count"],
        "slot_attempt_count": repaired_menu["slot_attempt_count"],
        "initial_invalid_indices": report["invalid_indices"],
        "retry_invalid_indices": retry_report["invalid_indices"],
        "repair_failures": repaired_menu["repair_failures"],
    }
    record_log(
        "warning",
        "ai",
        "No se pudo cerrar un menu semanal 100% IA tras reparacion dirigida por slots",
        unresolved_context,
    )
    raise WeeklyMenuResolutionError(
        "No se pudo cerrar un menu semanal 100% IA con las reglas actuales",
        unresolved_context,
    )


def generate_replacement(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    day_index: int,
    meal_type: str,
) -> RecipePayload:
    prompt = _build_replacement_prompt(ingredients, generation_context, day_index, meal_type)
    payload = _call_gemini(prompt, use_google_search=False, timeout_seconds=25)
    if payload and isinstance(payload.get("recipe"), dict) and _recipe_respects_context(
        payload["recipe"],
        ingredients,
        generation_context,
    ):
        item = _normalize_item(
            {
                "day_index": day_index,
                "day_name": DAYS[day_index],
                "meal_type": meal_type,
                "recipe": payload["recipe"],
                "explanation": payload.get("explanation", "Alternativa ajustada a tus preferencias."),
            },
            day_index,
            meal_type,
            ingredients,
        )
        item["ai_model"] = settings.gemini_model
        return item

    fallback = build_replacement_item(day_index, meal_type, ingredients, generation_context, offset=5)
    fallback["ai_model"] = "fallback-local"
    return fallback


def resolve_recipe_image(recipe: dict[str, Any]) -> dict[str, Any] | None:
    prompt = _build_image_lookup_prompt(recipe)
    payload = _call_gemini(prompt, use_google_search=settings.gemini_enable_google_search, timeout_seconds=35)
    if not isinstance(payload, dict):
        return None
    return _normalize_image_lookup(payload, str(recipe.get("title") or "receta"))


def _call_gemini_with_meta(
    prompt: str,
    *,
    use_google_search: bool,
    timeout_seconds: int,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    if not settings.has_valid_gemini_api_key:
        record_log(
            "warning",
            "ai",
            "Gemini API key ausente o no valida; se usa fallback local",
            {"model": settings.gemini_model},
        )
        return None, {"status": "missing_api_key", "model": settings.gemini_model}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    generation_config: dict[str, Any] = {"temperature": 0.3}
    payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }
    if use_google_search:
        payload["tools"] = [{"google_search": {}}]
    else:
        generation_config["responseMimeType"] = "application/json"

    headers = {"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key or ""}

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
        text = _extract_text(response.json())
        return _parse_json(text), {"status": "ok", "model": settings.gemini_model}
    except (httpx.HTTPError, KeyError, TypeError, json.JSONDecodeError) as exc:
        record_exception(
            "ai",
            "Fallo llamando a Gemini; se usa fallback local",
            exc,
            {
                "model": settings.gemini_model,
                "google_search_enabled": use_google_search,
                "timeout_seconds": timeout_seconds,
            },
        )
        return None, {
            "status": "call_error",
            "model": settings.gemini_model,
            "exception_type": exc.__class__.__name__,
        }


def _call_gemini(
    prompt: str,
    *,
    use_google_search: bool = False,
    timeout_seconds: int = 25,
) -> dict[str, Any] | None:
    payload, _meta = _call_gemini_with_meta(
        prompt,
        use_google_search=use_google_search,
        timeout_seconds=timeout_seconds,
    )
    return payload


def _extract_text(response: dict[str, Any]) -> str:
    parts = response["candidates"][0]["content"]["parts"]
    return "\n".join(str(part.get("text", "")) for part in parts).strip()


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.DOTALL).strip()

    try:
        parsed, _ = json.JSONDecoder().raw_decode(cleaned)
        return parsed
    except json.JSONDecodeError:
        for opener, closer in (("{", "}"), ("[", "]")):
            start = cleaned.find(opener)
            end = cleaned.rfind(closer)
            if start == -1 or end == -1 or end <= start:
                continue
            candidate = cleaned[start : end + 1]
            try:
                parsed, _ = json.JSONDecoder().raw_decode(candidate)
                return parsed
            except json.JSONDecodeError:
                continue
        raise


def _build_weekly_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> str:
    prompt_context = _prompt_context(ingredients, generation_context)
    return (
        "Actua como planificador de menus semanales para una app domestica. "
        "Devuelve solo JSON valido, sin markdown. "
        "Genera 14 platos: comida y cena para lunes a domingo.\n"
        "Reglas obligatorias:\n"
        "1. Usa los ingredientes disponibles como base principal del menu.\n"
        "2. Excluye por completo cualquier ingrediente marcado por el usuario.\n"
        "3. Prioriza recetas guardadas compatibles y, dentro de ellas, las favoritas compatibles no recientes.\n"
        "4. Evita repetir titulos que aparezcan en las recetas recientes.\n"
        "5. Solo crea recetas nuevas cuando no haya suficientes recetas guardadas compatibles para cubrir los huecos.\n"
        "6. Usa solo ingredientes principales de la lista cerrada `ingredientes_principales_permitidos`. No uses sinonimos, sustituciones o variantes que no aparezcan literalmente en esa lista.\n"
        "7. En el campo `ingredients` solo puedes incluir ingredientes de esa lista cerrada o ingredientes de `despensa_basica_permitida`, nunca otros ingredientes.\n"
        "8. La despensa basica solo puede actuar como apoyo. No la conviertas en la base real del plato ni en el elemento que define el tipo de receta.\n"
        "9. No uses mas ingredientes de despensa que ingredientes reales de nevera en una receta. Como maximo usa `politica_despensa.max_pantry_ingredients_per_recipe` ingredientes de despensa.\n"
        "10. Solo puedes usar como maximo `politica_despensa.max_structural_pantry_ingredients_per_recipe` ingrediente estructural de despensa por receta. Los ingredientes estructurales estan en `despensa_basica_estructural_limitada`.\n"
        "11. Si una receta solo usa 1 ingrediente de nevera, apoyate solo en apoyos ligeros de `despensa_basica_apoyo` y nunca en ingredientes estructurales de despensa.\n"
        "12. Si no puedes completar los 14 huecos cumpliendo las reglas, repite tecnicas o combinaciones con ingredientes disponibles antes de introducir ingredientes nuevos.\n"
        "13. No inventes ingredientes principales fuera de la nevera. Solo puedes asumir despensa basica permitida y nunca como protagonista.\n"
        f"Contexto de generacion: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"items\":[{\"day_index\":0,\"day_name\":\"Lunes\",\"meal_type\":\"comida\",\"explanation\":\"...\","
        "\"recipe\":{\"title\":\"...\",\"description\":\"...\",\"ingredients\":[\"...\"],\"steps\":[\"...\"],"
        "\"tags\":[\"...\"],\"prep_time_minutes\":25,\"difficulty\":\"Facil\",\"servings\":2}}]}"
    )


def _build_weekly_retry_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    report: ValidationReport,
) -> str:
    prompt_context = _prompt_context(ingredients, generation_context)
    invalid_slots = [
        {
            "slot_index": issue["index"],
            "day_name": DAYS[issue["index"] // 2],
            "meal_type": MEAL_TYPES[issue["index"] % 2],
            "invalid_reason": issue["invalid_reason"],
            "invalid_ingredients": issue["invalid_ingredients"],
            "title": issue["title"],
        }
        for issue in report["invalid_items"][:EXPECTED_WEEKLY_ITEMS]
    ]
    return (
        "La respuesta anterior para el menu semanal no paso la validacion. "
        "Vuelve a generar el menu completo desde cero y corrige estrictamente los huecos problematicos. "
        "Devuelve solo JSON valido, sin markdown y con exactamente 14 items.\n"
        "Motivo principal del rechazo anterior: "
        f"{report['invalid_reason'] or 'respuesta fuera de contexto'}.\n"
        f"Huecos problemáticos detectados: {json.dumps(invalid_slots, ensure_ascii=False)}\n"
        "Reglas obligatorias:\n"
        "1. Usa los ingredientes disponibles como base principal del menu.\n"
        "2. Excluye por completo cualquier ingrediente marcado por el usuario.\n"
        "3. No uses ingredientes principales fuera de `ingredientes_principales_permitidos`.\n"
        "4. En `ingredients` solo puedes incluir ingredientes disponibles o `despensa_basica_permitida`.\n"
        "5. No uses mas ingredientes de despensa que ingredientes de nevera y respeta `politica_despensa`.\n"
        "6. Si solo hay 1 ingrediente de nevera en la receta, no uses ingredientes estructurales de `despensa_basica_estructural_limitada`.\n"
        "7. Devuelve exactamente 14 items: comida y cena de lunes a domingo.\n"
        "8. Evita repetir titulos de recetas recientes.\n"
        f"Contexto de generacion: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"items\":[{\"day_index\":0,\"day_name\":\"Lunes\",\"meal_type\":\"comida\",\"explanation\":\"...\","
        "\"recipe\":{\"title\":\"...\",\"description\":\"...\",\"ingredients\":[\"...\"],\"steps\":[\"...\"],"
        "\"tags\":[\"...\"],\"prep_time_minutes\":25,\"difficulty\":\"Facil\",\"servings\":2}}]}"
    )


def _build_replacement_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    day_index: int,
    meal_type: str,
) -> str:
    prompt_context = _prompt_context(ingredients, generation_context)
    return (
        "Propone un unico plato de sustitucion para un menu semanal. "
        "Devuelve solo JSON valido, sin markdown.\n"
        "Usa ingredientes disponibles, respeta exclusiones, prioriza favoritas compatibles y evita recetas recientes.\n"
        "Usa solo ingredientes principales de la lista cerrada `ingredientes_principales_permitidos` o ingredientes de `despensa_basica_permitida`.\n"
        "No uses sinonimos, sustituciones o variantes que no aparezcan literalmente en esa lista.\n"
        "La despensa basica solo puede apoyar: no debe haber mas ingredientes de despensa que de nevera, y si solo usas 1 ingrediente de nevera no puedes apoyarte en ingredientes estructurales de despensa.\n"
        f"Dia: {DAYS[day_index]}, tipo: {meal_type}\n"
        f"Contexto de generacion: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"explanation\":\"...\",\"recipe\":{\"title\":\"...\",\"description\":\"...\",\"ingredients\":[\"...\"],"
        "\"steps\":[\"...\"],\"tags\":[\"...\"],\"prep_time_minutes\":25,\"difficulty\":\"Facil\",\"servings\":2}}"
    )


def _build_image_lookup_prompt(recipe: dict[str, Any]) -> str:
    lookup_context = {
        "title": recipe.get("title") or "",
        "description": recipe.get("description") or "",
        "ingredients": recipe.get("ingredients") or [],
        "tags": recipe.get("tags") or [],
    }
    return (
        "Actua como un asistente que busca una imagen real para una receta ya existente. "
        "Devuelve solo un objeto JSON valido, sin markdown, sin texto extra.\n"
        "Busca una imagen real representativa del plato usando la busqueda web disponible.\n"
        "Devuelve image_url solo si puedes aportar una URL directa de imagen accesible por HTTP o HTTPS.\n"
        "Devuelve image_source_url con la pagina donde encontraste la imagen, si existe.\n"
        "Nunca inventes URLs ni dominios.\n"
        "Si no encuentras una imagen real verificable, devuelve image_url null y image_lookup_status \"not_found\".\n"
        f"Receta: {json.dumps(lookup_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"image_url\":\"https://example.com/imagen.jpg\",\"image_source_url\":\"https://example.com/receta\","
        "\"image_alt_text\":\"...\",\"image_lookup_status\":\"found\",\"image_lookup_reason\":\"...\"}"
    )


def _has_valid_items(payload: dict[str, Any], expected: int) -> bool:
    items = payload.get("items")
    return isinstance(items, list) and len(items) >= expected


def _prompt_context(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> dict[str, Any]:
    saved_recipes = generation_context.get("compatible_saved_recipes") or []
    allowed_ingredient_names = [
        str(ingredient.get("name"))
        for ingredient in ingredients
        if ingredient.get("name")
    ]
    return {
        "ingredientes_principales_permitidos": allowed_ingredient_names,
        "ingredientes_disponibles": ingredients,
        "ingredientes_excluidos": generation_context.get("excluded_ingredient_names") or [],
        "preferencias_usuario": generation_context.get("preferences_text") or "sin preferencias adicionales",
        "resumen_preferencias": generation_context.get("preferences_summary") or "",
        "recetas_recientes_a_evitar": generation_context.get("recent_recipe_titles") or [],
        "despensa_basica_permitida": generation_context.get("pantry_basics") or [],
        "despensa_basica_apoyo": generation_context.get("pantry_support_basics") or [],
        "despensa_basica_estructural_limitada": generation_context.get("pantry_structural_basics") or [],
        "politica_despensa": generation_context.get("pantry_policy") or {},
        "recetas_guardadas_compatibles": [
            {
                "title": recipe.get("title"),
                "tags": recipe.get("tags") or [],
                "is_favorite": bool(recipe.get("is_favorite")),
                "is_recent": bool(recipe.get("is_recent")),
                "matched_ingredient_names": recipe.get("matched_ingredient_names") or [],
            }
            for recipe in saved_recipes
        ],
    }


def _weekly_payload_respects_context(
    payload: dict[str, Any],
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> bool:
    return _validate_weekly_payload(payload, ingredients, generation_context)["all_valid"]


def _recipe_respects_context(
    recipe: dict[str, Any],
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> bool:
    return _validate_recipe_context(recipe, ingredients, generation_context)["valid"]


def _validate_weekly_payload(
    payload: dict[str, Any] | None,
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> ValidationReport:
    report: ValidationReport = {
        "payload_present": payload is not None,
        "item_count": None,
        "accepted_count": 0,
        "all_valid": False,
        "validation_stage": "structure",
        "first_invalid_index": None,
        "first_invalid_title": None,
        "first_invalid_ingredients": None,
        "invalid_reason": "payload_absent",
        "invalid_items": [],
        "valid_indices": [],
        "invalid_indices": [],
        "slot_reports": [],
    }
    if not isinstance(payload, dict):
        _mark_all_slots_invalid(report, "structure", "payload_absent")
        return report

    items = payload.get("items")
    if not isinstance(items, list):
        report["invalid_reason"] = "items_not_list"
        _mark_all_slots_invalid(report, "structure", "items_not_list")
        return report

    report["item_count"] = len(items)
    if len(items) >= EXPECTED_WEEKLY_ITEMS:
        report["validation_stage"] = "recipe_context"
        report["invalid_reason"] = None
    else:
        report["validation_stage"] = "item_count"
        report["invalid_reason"] = "insufficient_items"

    for index in range(EXPECTED_WEEKLY_ITEMS):
        issue = _validate_weekly_item(index, items[index] if index < len(items) else None, ingredients, generation_context)
        report["slot_reports"].append(issue)
        if issue["valid"]:
            report["valid_indices"].append(index)
            report["accepted_count"] += 1
            continue
        report["invalid_indices"].append(index)
        report["invalid_items"].append(issue)

    if report["invalid_items"]:
        first_invalid = report["invalid_items"][0]
        report["validation_stage"] = first_invalid["validation_stage"]
        report["first_invalid_index"] = first_invalid["index"]
        report["first_invalid_title"] = first_invalid["title"]
        report["first_invalid_ingredients"] = first_invalid["invalid_ingredients"] or first_invalid["ingredients"]
        report["invalid_reason"] = first_invalid["invalid_reason"]
    else:
        report["all_valid"] = len(items) >= EXPECTED_WEEKLY_ITEMS
        report["validation_stage"] = "ok"
        report["invalid_reason"] = None

    return report


def _validate_weekly_item(
    index: int,
    item: Any,
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> dict[str, Any]:
    if item is None:
        return _invalid_weekly_issue(index, "item_count", "missing_item")
    if not isinstance(item, dict):
        return _invalid_weekly_issue(index, "structure", "item_not_object")

    recipe = item.get("recipe")
    if not isinstance(recipe, dict):
        return _invalid_weekly_issue(
            index,
            "structure",
            "recipe_not_object",
            title=str(item.get("title") or "") or None,
        )

    recipe_report = _validate_recipe_context(recipe, ingredients, generation_context)
    if not recipe_report["valid"]:
        return _invalid_weekly_issue(
            index,
            recipe_report["validation_stage"],
            recipe_report["invalid_reason"],
            title=recipe_report["title"],
            ingredients=recipe_report["ingredients"],
            invalid_ingredients=recipe_report["invalid_ingredients"],
            item=item,
        )

    return {
        "index": index,
        "valid": True,
        "validation_stage": "ok",
        "invalid_reason": None,
        "title": recipe_report["title"],
        "ingredients": recipe_report["ingredients"],
        "invalid_ingredients": [],
        "item": item,
    }


def _invalid_weekly_issue(
    index: int,
    validation_stage: str,
    invalid_reason: str,
    *,
    title: str | None = None,
    ingredients: list[str] | None = None,
    invalid_ingredients: list[str] | None = None,
    item: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "index": index,
        "valid": False,
        "validation_stage": validation_stage,
        "invalid_reason": invalid_reason,
        "title": title,
        "ingredients": ingredients or [],
        "invalid_ingredients": invalid_ingredients or [],
        "item": item,
    }


def _validate_recipe_context(
    recipe: dict[str, Any],
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> dict[str, Any]:
    ingredient_values = recipe.get("ingredients")
    if not isinstance(ingredient_values, list) or not ingredient_values:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "missing_ingredients",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [],
            "invalid_ingredients": [],
        }

    allowed_names = {
        _normalize_name(str(ingredient.get("name") or ""))
        for ingredient in ingredients
        if ingredient.get("name")
    }
    excluded_names = {
        _normalize_name(str(name))
        for name in (generation_context.get("excluded_ingredient_names") or [])
        if str(name).strip()
    }
    pantry_basics = {
        _normalize_name(str(name))
        for name in (generation_context.get("pantry_basics") or [])
        if str(name).strip()
    }
    pantry_support_basics = {
        _normalize_name(str(name))
        for name in (generation_context.get("pantry_support_basics") or [])
        if str(name).strip()
    }
    pantry_structural_basics = {
        _normalize_name(str(name))
        for name in (generation_context.get("pantry_structural_basics") or [])
        if str(name).strip()
    }
    pantry_policy = generation_context.get("pantry_policy") or {}
    max_pantry_ingredients = int(pantry_policy.get("max_pantry_ingredients_per_recipe") or 3)
    max_structural_pantry_ingredients = int(
        pantry_policy.get("max_structural_pantry_ingredients_per_recipe") or 1
    )
    single_fridge_ingredient_max_pantry = int(pantry_policy.get("single_fridge_ingredient_max_pantry") or 2)
    single_fridge_ingredient_allows_structural = bool(
        pantry_policy.get("single_fridge_ingredient_allows_structural_pantry")
    )
    recent_titles = {
        _normalize_name(str(title))
        for title in (generation_context.get("recent_recipe_titles") or [])
        if str(title).strip()
    }

    normalized_title = _normalize_name(str(recipe.get("title") or ""))
    if normalized_title in recent_titles:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "recent_recipe_repeated",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": [],
        }

    ingredient_names = [_normalize_name(_ingredient_name_from_value(value)) for value in ingredient_values if _ingredient_name_from_value(value)]
    if not ingredient_names:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "missing_ingredients",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [],
            "invalid_ingredients": [],
        }

    has_available_ingredient = False
    fridge_ingredient_count = 0
    pantry_ingredient_count = 0
    structural_pantry_count = 0
    pantry_hits: list[str] = []
    pantry_non_support_hits: list[str] = []
    excluded_hits: list[str] = []
    disallowed_hits: list[str] = []
    for ingredient_name in ingredient_names:
        if any(_matches_name(ingredient_name, excluded_name) for excluded_name in excluded_names):
            excluded_hits.append(ingredient_name)
            continue
        if any(_matches_name(ingredient_name, pantry_name) for pantry_name in pantry_basics):
            pantry_ingredient_count += 1
            pantry_hits.append(ingredient_name)
            if any(_matches_name(ingredient_name, pantry_name) for pantry_name in pantry_structural_basics):
                structural_pantry_count += 1
            if not any(_matches_name(ingredient_name, pantry_name) for pantry_name in pantry_support_basics):
                pantry_non_support_hits.append(ingredient_name)
            continue
        if not any(_matches_name(ingredient_name, allowed_name) for allowed_name in allowed_names):
            disallowed_hits.append(ingredient_name)
            continue
        has_available_ingredient = True
        fridge_ingredient_count += 1

    if excluded_hits:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "excluded_ingredient",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": excluded_hits,
        }

    if disallowed_hits:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "ingredient_not_allowed",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": disallowed_hits,
        }

    if not has_available_ingredient:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "missing_available_ingredient",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": [],
        }

    if pantry_ingredient_count > max_pantry_ingredients:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "too_many_pantry_ingredients",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": pantry_hits,
        }

    if fridge_ingredient_count > 1 and pantry_ingredient_count > fridge_ingredient_count:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "pantry_outweighs_fridge",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": pantry_hits,
        }

    if structural_pantry_count > max_structural_pantry_ingredients:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "too_many_structural_pantry_ingredients",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": pantry_hits,
        }

    if fridge_ingredient_count == 1 and pantry_ingredient_count > single_fridge_ingredient_max_pantry:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "pantry_overrides_single_fridge_ingredient",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": pantry_hits,
        }

    if fridge_ingredient_count == 1 and structural_pantry_count > 0 and not single_fridge_ingredient_allows_structural:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "structural_pantry_with_single_fridge_ingredient",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": pantry_hits,
        }

    if pantry_ingredient_count and pantry_ingredient_count == fridge_ingredient_count and pantry_non_support_hits:
        return {
            "valid": False,
            "validation_stage": "recipe_context",
            "invalid_reason": "pantry_dependency_too_high",
            "title": str(recipe.get("title") or "") or None,
            "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
            "invalid_ingredients": pantry_non_support_hits,
        }

    return {
        "valid": True,
        "validation_stage": "ok",
        "invalid_reason": None,
        "title": str(recipe.get("title") or "") or None,
        "ingredients": [str(value) for value in ingredient_values if str(value).strip()],
        "invalid_ingredients": [],
    }


def _normalize_name(value: str) -> str:
    raw = value.split(" - ", 1)[0].split(":", 1)[0].strip().lower()
    decomposed = unicode_normalize("NFKD", raw)
    cleaned = "".join(character for character in decomposed if not combining(character))
    return re.sub(r"\s+", " ", cleaned)


def _matches_name(left: str, right: str) -> bool:
    if len(left) < 3 or len(right) < 3:
        return False
    if left == right:
        return True
    left_tokens = _ingredient_tokens(left)
    right_tokens = _ingredient_tokens(right)
    if not left_tokens or not right_tokens:
        return False
    shorter, longer = (left_tokens, right_tokens) if len(left_tokens) <= len(right_tokens) else (right_tokens, left_tokens)
    return all(token in longer for token in shorter)


def _ingredient_tokens(value: str) -> list[str]:
    stopwords = {"de", "del", "la", "el", "los", "las", "y", "con", "al", "a", "en"}
    tokens = [token for token in re.split(r"[^a-z0-9]+", value) if token]
    normalized_tokens = []
    for token in tokens:
        if token in stopwords:
            continue
        if len(token) > 4 and token.endswith("s"):
            token = token[:-1]
        normalized_tokens.append(token)
    return normalized_tokens


def normalize_menu_item(
    item: dict[str, Any],
    fallback_index: int,
    ingredients: list[dict[str, str | None]],
) -> RecipePayload:
    day_index = int(item.get("day_index", fallback_index // 2)) % 7
    meal_type = str(item.get("meal_type") or MEAL_TYPES[fallback_index % 2]).lower()
    if meal_type not in MEAL_TYPES:
        meal_type = MEAL_TYPES[fallback_index % 2]
    return _normalize_item(item, day_index, meal_type, ingredients)


def _normalize_item(
    item: dict[str, Any],
    day_index: int,
    meal_type: str,
    ingredients: list[dict[str, str | None]],
) -> RecipePayload:
    fallback_names = [
        str(ingredient.get("name"))
        for ingredient in ingredients
        if ingredient.get("name")
    ] or ["verduras"]
    return {
        "day_index": day_index,
        "day_name": str(item.get("day_name") or DAYS[day_index]),
        "meal_type": meal_type,
        "explanation": str(item.get("explanation") or "Elegido por encajar con ingredientes y preferencias."),
        "recipe": _normalize_recipe(item.get("recipe") or {}, fallback_names),
    }


def _normalize_recipe(recipe: dict[str, Any], fallback_ingredients: list[str]) -> dict[str, Any]:
    title = str(recipe.get("title") or "Receta rapida de temporada")[:180]
    ingredient_lines = _normalize_ingredient_lines(recipe.get("ingredients"), fallback_ingredients)
    steps = _normalize_text_list(recipe.get("steps"), fallback=["Preparar ingredientes.", "Cocinar y servir."], limit=8)
    tags = _normalize_text_list(recipe.get("tags"), fallback=["rapida"], limit=8)
    normalized_recipe = {
        "title": title,
        "description": str(recipe.get("description") or "Receta sencilla para el menu semanal.")[:500],
        "ingredients": ingredient_lines,
        "steps": steps,
        "tags": tags,
        "prep_time_minutes": int(recipe.get("prep_time_minutes") or 25),
        "difficulty": str(recipe.get("difficulty") or "")[:40],
        "servings": int(recipe.get("servings") or 2),
        **_empty_image_lookup(),
    }
    source = _clean_text(recipe.get("source"), 120)
    if source:
        normalized_recipe["source"] = source
    return normalized_recipe


def _annotate_weekly_recipe_sources(payload: dict[str, Any] | None, source: str) -> None:
    if not isinstance(payload, dict):
        return
    items = payload.get("items")
    if not isinstance(items, list):
        return
    for item in items[:EXPECTED_WEEKLY_ITEMS]:
        if not isinstance(item, dict):
            continue
        recipe = item.get("recipe")
        if isinstance(recipe, dict) and not _clean_text(recipe.get("source"), 120):
            recipe["source"] = source


def _build_ai_weekly_response(
    payload: dict[str, Any],
    *,
    retried: bool,
    repaired_slots: int = 0,
) -> MenuPayload:
    payload["ai_model"] = settings.gemini_model
    if repaired_slots > 0:
        payload["notes"] = (
            "Menu generado con IA real tras reparar huecos invalidos con IA. "
            f"Huecos reparados: {repaired_slots}."
        )
    elif retried:
        payload["notes"] = "Menu generado con IA real tras un reintento de validacion."
    else:
        payload["notes"] = "Menu generado con IA real a partir de ingredientes y preferencias."
    return payload


def _build_full_fallback_weekly_response(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    *,
    reason: str,
    report: ValidationReport,
    retry_used: bool,
) -> MenuPayload:
    fallback = build_weekly_menu(ingredients, generation_context)
    fallback["ai_model"] = "fallback-local"
    fallback["notes"] = _weekly_fallback_note(reason, retry_used=retry_used)
    record_log(
        "warning",
        "ai",
        "Generacion semanal degradada a fallback local completo",
        {
            "fallback_reason": reason,
            "retry_used": retry_used,
            "payload_present": report["payload_present"],
            "item_count": report["item_count"],
            "validation_stage": report["validation_stage"],
            "first_invalid_index": report["first_invalid_index"],
            "first_invalid_title": report["first_invalid_title"],
            "first_invalid_ingredients": report["first_invalid_ingredients"],
            "invalid_reason": report["invalid_reason"],
        },
    )
    return fallback


def _repair_weekly_slots_with_ai(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    *,
    initial_payload: dict[str, Any] | None,
    initial_report: ValidationReport,
    retry_payload: dict[str, Any] | None,
    retry_report: ValidationReport,
) -> dict[str, Any]:
    initial_items = _payload_items(initial_payload)
    retry_items = _payload_items(retry_payload)
    final_items: list[dict[str, Any]] = []
    blocked_titles: list[str] = []
    repaired_item_count = 0
    slot_attempt_count = 0
    unresolved_indices: list[int] = []
    repair_failures: list[dict[str, Any]] = []

    for index in range(EXPECTED_WEEKLY_ITEMS):
        selected_item = _select_valid_weekly_item(
            index=index,
            initial_items=initial_items,
            initial_report=initial_report,
            retry_items=retry_items,
            retry_report=retry_report,
        )
        if selected_item:
            _annotate_item_recipe_source(selected_item, settings.gemini_model)
            final_items.append(selected_item)
            _register_used_title(blocked_titles, selected_item)
            continue

        slot_attempt_count += 1
        repaired_item, failure = _repair_weekly_slot_with_ai(
            index=index,
            ingredients=ingredients,
            generation_context=generation_context,
            blocked_titles=blocked_titles,
        )
        if repaired_item:
            final_items.append(repaired_item)
            repaired_item_count += 1
            _register_used_title(blocked_titles, repaired_item)
            continue

        unresolved_indices.append(index)
        repair_failures.append(failure)

    return {
        "items": final_items,
        "repaired_item_count": repaired_item_count,
        "slot_attempt_count": slot_attempt_count,
        "unresolved_count": len(unresolved_indices),
        "unresolved_indices": unresolved_indices,
        "repair_failures": repair_failures,
    }


def _repair_weekly_slot_with_ai(
    *,
    index: int,
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    blocked_titles: list[str],
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    day_index = index // 2
    meal_type = MEAL_TYPES[index % 2]
    repair_context = _generation_context_for_slot_repair(generation_context, blocked_titles)
    prompt = _build_replacement_prompt(ingredients, repair_context, day_index, meal_type)
    payload, call_meta = _call_gemini_with_meta(prompt, use_google_search=False, timeout_seconds=20)

    if not isinstance(payload, dict) or not isinstance(payload.get("recipe"), dict):
        failure = {
            "index": index,
            "day_name": DAYS[day_index],
            "meal_type": meal_type,
            "failure_stage": "call" if payload is None else "structure",
            "invalid_reason": "payload_absent" if payload is None else "replacement_recipe_not_object",
            "call_status": call_meta.get("status"),
        }
        record_log(
            "warning",
            "ai",
            "La reparacion IA de un slot semanal no devolvio una receta valida",
            failure,
        )
        return None, failure

    recipe_report = _validate_recipe_context(payload["recipe"], ingredients, repair_context)
    if not recipe_report["valid"]:
        failure = {
            "index": index,
            "day_name": DAYS[day_index],
            "meal_type": meal_type,
            "failure_stage": recipe_report["validation_stage"],
            "invalid_reason": recipe_report["invalid_reason"],
            "title": recipe_report["title"],
            "invalid_ingredients": recipe_report["invalid_ingredients"],
            "call_status": call_meta.get("status"),
        }
        record_log(
            "warning",
            "ai",
            "La reparacion IA de un slot semanal fue rechazada por validacion",
            failure,
        )
        return None, failure

    item = _normalize_item(
        {
            "day_index": day_index,
            "day_name": DAYS[day_index],
            "meal_type": meal_type,
            "recipe": payload["recipe"],
            "explanation": payload.get("explanation", "Plato reparado con IA para completar el menu semanal."),
        },
        day_index,
        meal_type,
        ingredients,
    )
    _annotate_item_recipe_source(item, settings.gemini_model)
    record_log(
        "info",
        "ai",
        "Slot semanal reparado con IA",
        {"index": index, "day_name": DAYS[day_index], "meal_type": meal_type},
    )
    return item, {
        "index": index,
        "day_name": DAYS[day_index],
        "meal_type": meal_type,
        "failure_stage": None,
        "invalid_reason": None,
        "call_status": call_meta.get("status"),
    }


def _generation_context_for_slot_repair(
    generation_context: GenerationContext,
    blocked_titles: list[str],
) -> GenerationContext:
    blocked_normalized = {_normalize_name(title) for title in blocked_titles if str(title).strip()}
    combined_recent = list(generation_context.get("recent_recipe_titles") or [])
    combined_recent.extend(title for title in blocked_titles if str(title).strip())
    compatible_saved_recipes = [
        recipe
        for recipe in (generation_context.get("compatible_saved_recipes") or [])
        if _normalize_name(str(recipe.get("title") or "")) not in blocked_normalized
    ]
    return {
        **generation_context,
        "recent_recipe_titles": _unique_texts(combined_recent),
        "compatible_saved_recipes": compatible_saved_recipes,
    }


def _unique_texts(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        normalized = _normalize_name(str(value or ""))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(str(value))
    return ordered


def _payload_items(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    return []


def _select_valid_weekly_item(
    *,
    index: int,
    initial_items: list[dict[str, Any]],
    initial_report: ValidationReport,
    retry_items: list[dict[str, Any]],
    retry_report: ValidationReport,
) -> dict[str, Any] | None:
    retry_slot = retry_report["slot_reports"][index]
    if retry_slot["valid"] and index < len(retry_items):
        return retry_items[index]
    initial_slot = initial_report["slot_reports"][index]
    if initial_slot["valid"] and index < len(initial_items):
        return initial_items[index]
    return None


def _annotate_item_recipe_source(item: dict[str, Any], source: str) -> None:
    recipe = item.get("recipe")
    if isinstance(recipe, dict):
        recipe["source"] = source


def _register_used_title(used_titles: list[str], item: dict[str, Any]) -> None:
    recipe = item.get("recipe")
    if not isinstance(recipe, dict):
        return
    title = str(recipe.get("title") or "").strip()
    if title and _normalize_name(title) not in {_normalize_name(current) for current in used_titles}:
        used_titles.append(title)


def _log_weekly_validation_failure(report: ValidationReport, *, attempt: str) -> None:
    record_log(
        "warning",
        "ai",
        "Respuesta semanal de Gemini rechazada durante validacion",
        {
            "attempt": attempt,
            "payload_present": report["payload_present"],
            "item_count": report["item_count"],
            "accepted_count": report["accepted_count"],
            "validation_stage": report["validation_stage"],
            "first_invalid_index": report["first_invalid_index"],
            "first_invalid_title": report["first_invalid_title"],
            "first_invalid_ingredients": report["first_invalid_ingredients"],
            "invalid_reason": report["invalid_reason"],
            "invalid_indices": report["invalid_indices"][:EXPECTED_WEEKLY_ITEMS],
        },
    )


def _mark_all_slots_invalid(report: ValidationReport, validation_stage: str, invalid_reason: str) -> None:
    issues = [
        _invalid_weekly_issue(index, validation_stage, invalid_reason)
        for index in range(EXPECTED_WEEKLY_ITEMS)
    ]
    report["slot_reports"] = issues
    report["invalid_items"] = issues
    report["invalid_indices"] = list(range(EXPECTED_WEEKLY_ITEMS))
    report["first_invalid_index"] = 0
    report["validation_stage"] = validation_stage
    report["invalid_reason"] = invalid_reason


def _fallback_reason_from_call_status(status: Any) -> str:
    if status == "missing_api_key":
        return "missing_api_key"
    if status == "call_error":
        return "model_call_failed"
    return "invalid_model_response"


def _weekly_fallback_note(reason: str, *, retry_used: bool) -> str:
    if reason == "missing_api_key":
        return "Menu creado con fallback local porque Gemini no estaba configurado."
    if reason == "model_call_failed":
        return "Menu creado con fallback local tras un error al llamar a Gemini."
    if reason == "repair_failed":
        return (
            "Menu creado con fallback local porque la respuesta inicial y el reintento de Gemini "
            "no pasaron la validacion de contexto."
        )
    if retry_used:
        return "Menu creado con fallback local tras invalidarse la respuesta de Gemini y su reintento."
    return "Menu creado con fallback local porque la respuesta de Gemini no paso la validacion de contexto."


def _normalize_ingredient_lines(value: Any, fallback: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback[:12]

    normalized = [_ingredient_line_from_value(item) for item in value]
    cleaned = [item for item in normalized if item]
    return cleaned[:12] or fallback[:12]


def _ingredient_line_from_value(value: Any) -> str | None:
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None

    if not isinstance(value, dict):
        return None

    name = _clean_text(value.get("item") or value.get("name") or value.get("ingredient"), 120)
    quantity = _clean_text(value.get("quantity"), 80)
    notes = _clean_text(value.get("notes"), 80)
    if not name:
        return None
    suffix = quantity or ""
    if notes:
        suffix = f"{suffix} ({notes})".strip() if suffix else notes
    return f"{name} - {suffix}".strip(" -") if suffix else name


def _ingredient_name_from_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("item") or value.get("name") or value.get("ingredient") or "")
    return str(value)


def _normalize_text_list(value: Any, fallback: list[str], limit: int) -> list[str]:
    if not isinstance(value, list):
        return fallback[:limit]
    cleaned = [str(item).strip() for item in value if str(item).strip()]
    return cleaned[:limit] or fallback[:limit]


def _normalize_image_lookup(recipe: dict[str, Any], recipe_title: str) -> dict[str, Any]:
    raw_image_url = _clean_http_url(recipe.get("image_url"))
    raw_source_url = _clean_http_url(recipe.get("image_source_url"))
    alt_text = _clean_text(recipe.get("image_alt_text"), 240)
    status = _normalize_image_status(recipe.get("image_lookup_status"))
    reason = _clean_text(recipe.get("image_lookup_reason"), 240)
    resolved_source_url = _resolve_source_url(raw_source_url) if raw_source_url else None

    if not raw_image_url:
        return {
            "image_url": None,
            "image_source_url": resolved_source_url,
            "image_alt_text": alt_text,
            "image_lookup_status": "not_found",
            "image_lookup_reason": reason or "La IA no encontro una imagen real verificable para esta receta.",
        }

    resolved_image_url = _resolve_image_url(raw_image_url)
    if not resolved_image_url:
        record_log(
            "warning",
            "ai",
            "La URL de imagen devuelta por Gemini no se pudo validar",
            {"recipe_title": recipe_title},
        )
        return {
            "image_url": None,
            "image_source_url": resolved_source_url,
            "image_alt_text": alt_text,
            "image_lookup_status": "invalid",
            "image_lookup_reason": "La IA propuso una imagen, pero la URL no se pudo validar como imagen directa.",
        }

    final_reason = reason
    if not final_reason:
        final_reason = (
            "Gemini encontro una imagen real y una pagina fuente para esta receta."
            if resolved_source_url
            else "Gemini encontro una imagen real, pero no se pudo resolver una pagina fuente canonical."
        )

    return {
        "image_url": resolved_image_url,
        "image_source_url": resolved_source_url,
        "image_alt_text": alt_text or f"Imagen de {recipe_title}.",
        "image_lookup_status": "found" if status != "invalid" else "invalid",
        "image_lookup_reason": final_reason,
    }


def _empty_image_lookup() -> dict[str, Any]:
    return {
        "image_url": None,
        "image_source_url": None,
        "image_alt_text": None,
        "image_lookup_status": None,
        "image_lookup_reason": None,
    }


def _normalize_image_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    return status if status in {"found", "not_found", "invalid"} else "not_found"


def _clean_text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned[:limit] if cleaned else None


def _clean_http_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return cleaned[:500]


@lru_cache(maxsize=256)
def _resolve_image_url(url: str) -> str | None:
    return _resolve_remote_url(url, expect_image=True)


@lru_cache(maxsize=256)
def _resolve_source_url(url: str) -> str | None:
    return _resolve_remote_url(url, expect_image=False)


def _resolve_remote_url(url: str, expect_image: bool) -> str | None:
    headers = {
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "image/*,*/*;q=0.8" if expect_image else "text/html,*/*;q=0.8",
    }
    try:
        with httpx.Client(timeout=8, follow_redirects=True, headers=headers) as client:
            probe = _probe_url(client, url, method="HEAD")
            if probe is None or _needs_get_retry(probe[0], probe[1], expect_image):
                probe = _probe_url(client, url, method="GET")
            if probe is None:
                return None
            status_code, content_type, final_url = probe
            if expect_image:
                return final_url if 200 <= status_code < 300 and content_type.startswith("image/") else None
            return final_url if 200 <= status_code < 400 or status_code in {403, 405} else None
    except httpx.HTTPError:
        return None


def _probe_url(client: httpx.Client, url: str, method: str) -> tuple[int, str, str] | None:
    try:
        if method == "HEAD":
            response = client.head(url)
            return response.status_code, response.headers.get("content-type", "").split(";", 1)[0].lower(), str(response.url)
        with client.stream("GET", url) as response:
            return response.status_code, response.headers.get("content-type", "").split(";", 1)[0].lower(), str(response.url)
    except httpx.HTTPError:
        return None


def _needs_get_retry(status_code: int, content_type: str, expect_image: bool) -> bool:
    if status_code in {403, 405}:
        return True
    if expect_image and not content_type.startswith("image/"):
        return True
    return False
