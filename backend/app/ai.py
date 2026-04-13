from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import settings
from .logging_service import record_exception, record_log

DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]
MEAL_TYPES = ["comida", "cena"]

RecipePayload = dict[str, Any]
MenuPayload = dict[str, Any]


def generate_weekly_menu(
    ingredients: list[dict[str, str | None]],
    preferences: str,
    previous_recipe_titles: list[str],
) -> MenuPayload:
    prompt = _build_weekly_prompt(ingredients, preferences, previous_recipe_titles)
    payload = _call_gemini(prompt)
    if payload and _has_valid_items(payload, 14):
        payload["ai_model"] = settings.gemini_model
        return payload

    fallback = _fallback_menu(ingredients, preferences, previous_recipe_titles)
    fallback["ai_model"] = "fallback-local"
    return fallback


def generate_replacement(
    ingredients: list[dict[str, str | None]],
    preferences: str,
    previous_recipe_titles: list[str],
    day_index: int,
    meal_type: str,
) -> RecipePayload:
    prompt = _build_replacement_prompt(ingredients, preferences, previous_recipe_titles, day_index, meal_type)
    payload = _call_gemini(prompt)
    if payload and isinstance(payload.get("recipe"), dict):
        return _normalize_item(
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

    return _fallback_item(day_index, meal_type, ingredients, preferences, previous_recipe_titles, offset=5)


def generate_variant(recipe: dict[str, Any], preferences: str) -> RecipePayload:
    prompt = (
        "Genera una variante de esta receta en JSON estricto. "
        "Mantiene dificultad baja, cambia al menos 2 ingredientes o pasos y respeta preferencias.\n"
        f"Preferencias: {preferences or 'sin preferencias adicionales'}\n"
        f"Receta base: {json.dumps(recipe, ensure_ascii=False, default=str)}\n"
        "Formato exacto: {\"recipe\":{\"title\":\"...\",\"description\":\"...\",\"ingredients\":[\"...\"],"
        "\"steps\":[\"...\"],\"tags\":[\"...\"],\"prep_time_minutes\":25},\"explanation\":\"...\"}"
    )
    payload = _call_gemini(prompt)
    if payload and isinstance(payload.get("recipe"), dict):
        return {
            "recipe": _normalize_recipe(payload["recipe"], ["verduras"]),
            "explanation": str(payload.get("explanation") or "Variante generada desde una receta guardada."),
        }

    base_title = recipe.get("title") or "receta guardada"
    variant = _normalize_recipe(
        {
            "title": f"Variante de {base_title}",
            "description": "Version rapida con ajustes de ingredientes y preparacion.",
            "ingredients": list(recipe.get("ingredients") or [])[:4] + ["hierbas frescas", "limon"],
            "steps": [
                "Prepara los ingredientes principales.",
                "Saltea o asa la base con hierbas frescas.",
                "Ajusta con limon y sirve caliente.",
            ],
            "tags": list(set((recipe.get("tags") or []) + ["variante", "rapida"])),
            "prep_time_minutes": recipe.get("prep_time_minutes") or 25,
        },
        ["verduras"],
    )
    return {"recipe": variant, "explanation": "Fallback local: variante simple para mantener la demo operativa."}


def _call_gemini(prompt: str) -> dict[str, Any] | None:
    if not settings.gemini_api_key:
        record_log(
            "warning",
            "ai",
            "Gemini API key no configurada; se usa fallback local",
            {"model": settings.gemini_model},
        )
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "responseMimeType": "application/json"},
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key}

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
    preferences: str,
    previous_recipe_titles: list[str],
) -> str:
    return (
        "Actua como planificador de menus semanales para una app domestica. "
        "Devuelve solo JSON valido, sin markdown. Genera 14 platos: comida y cena para lunes a domingo. "
        "Usa ingredientes disponibles cuando tenga sentido, respeta preferencias y evita repetir recetas recientes.\n"
        f"Ingredientes disponibles: {json.dumps(ingredients, ensure_ascii=False)}\n"
        f"Preferencias: {preferences or 'sin preferencias adicionales'}\n"
        f"Recetas recientes a evitar: {previous_recipe_titles}\n"
        "Formato exacto: {\"items\":[{\"day_index\":0,\"day_name\":\"Lunes\",\"meal_type\":\"comida\","
        "\"explanation\":\"...\",\"recipe\":{\"title\":\"...\",\"description\":\"...\","
        "\"ingredients\":[\"...\"],\"steps\":[\"...\"],\"tags\":[\"...\"],\"prep_time_minutes\":25}}]}"
    )


def _build_replacement_prompt(
    ingredients: list[dict[str, str | None]],
    preferences: str,
    previous_recipe_titles: list[str],
    day_index: int,
    meal_type: str,
) -> str:
    return (
        "Propone un unico plato de sustitucion para un menu semanal. "
        "Devuelve solo JSON valido, sin markdown, con una receta sencilla y una explicacion breve.\n"
        f"Dia: {DAYS[day_index]}, tipo: {meal_type}\n"
        f"Ingredientes disponibles: {json.dumps(ingredients, ensure_ascii=False)}\n"
        f"Preferencias: {preferences or 'sin preferencias adicionales'}\n"
        f"Recetas recientes a evitar: {previous_recipe_titles}\n"
        "Formato exacto: {\"explanation\":\"...\",\"recipe\":{\"title\":\"...\",\"description\":\"...\","
        "\"ingredients\":[\"...\"],\"steps\":[\"...\"],\"tags\":[\"...\"],\"prep_time_minutes\":25}}"
    )


def _has_valid_items(payload: dict[str, Any], expected: int) -> bool:
    items = payload.get("items")
    return isinstance(items, list) and len(items) >= expected


def _fallback_menu(
    ingredients: list[dict[str, str | None]],
    preferences: str,
    previous_recipe_titles: list[str],
) -> MenuPayload:
    items = []
    for day_index, _day in enumerate(DAYS):
        for meal_type in MEAL_TYPES:
            offset = day_index * 2 + MEAL_TYPES.index(meal_type)
            items.append(_fallback_item(day_index, meal_type, ingredients, preferences, previous_recipe_titles, offset))
    return {
        "items": items,
        "notes": "Menu creado con fallback local para garantizar ejecucion sin clave de Gemini.",
    }


def _fallback_item(
    day_index: int,
    meal_type: str,
    ingredients: list[dict[str, str | None]],
    preferences: str,
    previous_recipe_titles: list[str],
    offset: int,
) -> RecipePayload:
    names = [str(item.get("name")).strip() for item in ingredients if item.get("name")]
    if not names:
        names = ["verduras", "arroz", "huevos", "legumbres", "pasta", "pollo", "tomate"]

    main = names[offset % len(names)]
    side = names[(offset + 2) % len(names)]
    templates = [
        ("Bowl rapido de {main} y {side}", "Bowl templado con base de cereal, proteina sencilla y verduras."),
        ("Salteado de {main} con {side}", "Salteado de una sarten pensado para aprovechar nevera."),
        ("Tortilla abierta de {main}", "Receta flexible para una cena rapida y saciante."),
        ("Pasta corta con {main}", "Plato de despensa con salsa ligera y verduras."),
        ("Ensalada completa de {main}", "Plato fresco con contraste de textura y una vinagreta simple."),
        ("Guiso suave de {main} y {side}", "Preparacion de cuchara con ingredientes cotidianos."),
    ]
    title_template, description = templates[offset % len(templates)]
    title = title_template.format(main=main, side=side)

    if title in previous_recipe_titles:
        title = f"{title} version {DAYS[day_index].lower()}"

    tags = ["fallback", "aprovechamiento", meal_type]
    if preferences:
        tags.append("preferencias")

    return {
        "day_index": day_index,
        "day_name": DAYS[day_index],
        "meal_type": meal_type,
        "explanation": f"Usa {main} y rota tecnicas para evitar repetir la semana anterior.",
        "recipe": {
            "title": title,
            "description": description,
            "ingredients": [main, side, "aceite de oliva", "sal", "pimienta"],
            "steps": [
                "Lava y corta los ingredientes principales.",
                "Cocina la base a fuego medio hasta que este tierna.",
                "Ajusta sal, pimienta y sirve en el momento.",
            ],
            "tags": tags,
            "prep_time_minutes": 25 + (offset % 3) * 5,
        },
    }


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
    }
