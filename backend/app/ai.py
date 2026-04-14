from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import settings
from .demo_fallback import DAYS, MEAL_TYPES, build_replacement_item, build_variant, build_weekly_menu
from .logging_service import record_exception, record_log

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

    fallback = build_weekly_menu(ingredients, preferences, previous_recipe_titles)
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

    fallback = build_replacement_item(day_index, meal_type, ingredients, preferences, previous_recipe_titles, offset=5)
    fallback["ai_model"] = "fallback-local"
    return fallback


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

    variant = _normalize_recipe(build_variant(recipe), ["verduras"])
    return {"recipe": variant, "explanation": "Fallback local: variante simple para mantener la demo operativa."}


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
