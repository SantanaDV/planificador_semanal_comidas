from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import settings
from .demo_fallback import DAYS, MEAL_TYPES, build_replacement_item, build_weekly_menu
from .logging_service import record_exception, record_log

RecipePayload = dict[str, Any]
MenuPayload = dict[str, Any]
GenerationContext = dict[str, Any]


def generate_weekly_menu(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> MenuPayload:
    prompt = _build_weekly_prompt(ingredients, generation_context)
    payload = _call_gemini(prompt)
    if payload and _has_valid_items(payload, 14) and _weekly_payload_respects_context(payload, ingredients, generation_context):
        payload["ai_model"] = settings.gemini_model
        return payload

    fallback = build_weekly_menu(ingredients, generation_context)
    fallback["ai_model"] = "fallback-local"
    return fallback


def generate_replacement(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    day_index: int,
    meal_type: str,
) -> RecipePayload:
    prompt = _build_replacement_prompt(ingredients, generation_context, day_index, meal_type)
    payload = _call_gemini(prompt)
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


def _call_gemini(prompt: str) -> dict[str, Any] | None:
    if not settings.has_valid_gemini_api_key:
        record_log(
            "warning",
            "ai",
            "Gemini API key ausente o no valida; se usa fallback local",
            {"model": settings.gemini_model},
        )
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "responseMimeType": "application/json"},
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key or ""}

    try:
        with httpx.Client(timeout=25) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
        text = _extract_text(response.json())
        return _parse_json(text)
    except (httpx.HTTPError, KeyError, TypeError, json.JSONDecodeError) as exc:
        record_exception(
            "ai",
            "Fallo llamando a Gemini; se usa fallback local",
            exc,
            {"model": settings.gemini_model},
        )
        return None


def _extract_text(response: dict[str, Any]) -> str:
    parts = response["candidates"][0]["content"]["parts"]
    return "\n".join(str(part.get("text", "")) for part in parts).strip()


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def _build_weekly_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> str:
    prompt_context = _prompt_context(ingredients, generation_context)
    return (
        "Actua como planificador de menus semanales para una app domestica. "
        "Devuelve solo JSON valido, sin markdown. Genera 14 platos: comida y cena para lunes a domingo.\n"
        "Reglas obligatorias:\n"
        "1. Usa los ingredientes disponibles como base principal del menu.\n"
        "2. Excluye por completo cualquier ingrediente marcado por el usuario.\n"
        "3. Prioriza recetas guardadas compatibles y, dentro de ellas, las favoritas compatibles no recientes.\n"
        "4. Evita repetir titulos que aparezcan en las recetas recientes.\n"
        "5. Solo crea recetas nuevas cuando no haya suficientes recetas guardadas compatibles para cubrir los huecos.\n"
        "6. No inventes ingredientes principales fuera de la nevera. Solo puedes asumir los basicos de despensa permitidos y nunca como protagonistas.\n"
        "7. Si reutilizas una receta guardada, conserva su titulo y mantente fiel a sus ingredientes base.\n"
        f"Contexto de generacion: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: {\"items\":[{\"day_index\":0,\"day_name\":\"Lunes\",\"meal_type\":\"comida\","
        "\"explanation\":\"...\",\"recipe\":{\"title\":\"...\",\"description\":\"...\","
        "\"ingredients\":[\"...\"],\"steps\":[\"...\"],\"tags\":[\"...\"],\"prep_time_minutes\":25,"
        "\"difficulty\":\"Facil\",\"servings\":2}}]}"
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
        "Devuelve solo JSON valido, sin markdown, con una receta sencilla y una explicacion breve.\n"
        "Usa ingredientes disponibles, respeta exclusiones, prioriza favoritas compatibles y evita recetas recientes.\n"
        f"Dia: {DAYS[day_index]}, tipo: {meal_type}\n"
        f"Contexto de generacion: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: {\"explanation\":\"...\",\"recipe\":{\"title\":\"...\",\"description\":\"...\","
        "\"ingredients\":[\"...\"],\"steps\":[\"...\"],\"tags\":[\"...\"],\"prep_time_minutes\":25,"
        "\"difficulty\":\"Facil\",\"servings\":2}}"
    )


def _has_valid_items(payload: dict[str, Any], expected: int) -> bool:
    items = payload.get("items")
    return isinstance(items, list) and len(items) >= expected


def _prompt_context(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> dict[str, Any]:
    saved_recipes = generation_context.get("compatible_saved_recipes") or []
    return {
        "ingredientes_disponibles": ingredients,
        "ingredientes_excluidos": generation_context.get("excluded_ingredient_names") or [],
        "preferencias_usuario": generation_context.get("preferences_text") or "sin preferencias adicionales",
        "resumen_preferencias": generation_context.get("preferences_summary") or "",
        "recetas_recientes_a_evitar": generation_context.get("recent_recipe_titles") or [],
        "basicos_despensa_permitidos": generation_context.get("pantry_basics") or [],
        "recetas_guardadas_compatibles": [
            {
                "title": recipe.get("title"),
                "description": recipe.get("description"),
                "ingredients": recipe.get("ingredients") or [],
                "tags": recipe.get("tags") or [],
                "prep_time_minutes": recipe.get("prep_time_minutes"),
                "difficulty": recipe.get("difficulty"),
                "servings": recipe.get("servings"),
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
    items = payload.get("items")
    return isinstance(items, list) and all(
        isinstance(item, dict) and _recipe_respects_context(item.get("recipe") or {}, ingredients, generation_context)
        for item in items[:14]
    )


def _recipe_respects_context(
    recipe: dict[str, Any],
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> bool:
    ingredient_values = recipe.get("ingredients")
    if not isinstance(ingredient_values, list) or not ingredient_values:
        return False

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
    recent_titles = {
        _normalize_name(str(title))
        for title in (generation_context.get("recent_recipe_titles") or [])
        if str(title).strip()
    }

    if _normalize_name(str(recipe.get("title") or "")) in recent_titles:
        return False

    has_available_ingredient = False
    for raw_name in ingredient_values:
        ingredient_name = _normalize_name(str(raw_name))
        if not ingredient_name:
            continue
        if any(_matches_name(ingredient_name, excluded_name) for excluded_name in excluded_names):
            return False
        if any(_matches_name(ingredient_name, pantry_name) for pantry_name in pantry_basics):
            continue
        if not any(_matches_name(ingredient_name, allowed_name) for allowed_name in allowed_names):
            return False
        has_available_ingredient = True

    return has_available_ingredient


def _normalize_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.split(" - ", 1)[0].split(":", 1)[0].strip().lower())


def _matches_name(left: str, right: str) -> bool:
    if len(left) < 3 or len(right) < 3:
        return False
    return left in right or right in left


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
    title = str(recipe.get("title") or "Receta rapida de temporada")
    ingredients = recipe.get("ingredients") if isinstance(recipe.get("ingredients"), list) else fallback_ingredients
    steps = (
        recipe.get("steps")
        if isinstance(recipe.get("steps"), list)
        else ["Preparar ingredientes.", "Cocinar y servir."]
    )
    tags = recipe.get("tags") if isinstance(recipe.get("tags"), list) else ["rapida"]
    return {
        "title": title[:180],
        "description": str(recipe.get("description") or "Receta sencilla para el menu semanal."),
        "ingredients": [str(value) for value in ingredients][:12],
        "steps": [str(value) for value in steps][:8],
        "tags": [str(value) for value in tags][:8],
        "prep_time_minutes": int(recipe.get("prep_time_minutes") or 25),
        "difficulty": str(recipe.get("difficulty") or ""),
        "servings": int(recipe.get("servings") or 2),
        "image_url": str(recipe.get("image_url") or "")[:500],
    }
