from __future__ import annotations

from typing import Any

DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]
MEAL_TYPES = ["comida", "cena"]

RecipePayload = dict[str, Any]
MenuPayload = dict[str, Any]


def build_weekly_menu(
    ingredients: list[dict[str, str | None]],
    preferences: str,
    previous_recipe_titles: list[str],
) -> MenuPayload:
    items = []
    for day_index, _day in enumerate(DAYS):
        for meal_type in MEAL_TYPES:
            offset = day_index * 2 + MEAL_TYPES.index(meal_type)
            items.append(build_replacement_item(day_index, meal_type, ingredients, preferences, previous_recipe_titles, offset))
    return {
        "items": items,
        "notes": "Menu creado con fallback local controlado para garantizar ejecucion sin clave de Gemini.",
    }


def build_replacement_item(
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

    preferred_titles = _extract_context_titles(preferences, "Recetas favoritas compatibles")
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
    tags = ["fallback", "aprovechamiento", meal_type]
    if preferred_titles and offset < len(preferred_titles) and preferred_titles[offset] not in previous_recipe_titles:
        title = preferred_titles[offset]
        description = "Receta favorita compatible priorizada sin forzar ingredientes fuera de la nevera."
        tags.append("favorita")

    if title in previous_recipe_titles:
        title = f"{title} version {DAYS[day_index].lower()}"

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
            "ingredients": list(dict.fromkeys([main, side])),
            "steps": [
                "Lava y corta los ingredientes principales.",
                "Cocina la base a fuego medio hasta que este tierna.",
                "Ajusta el punto final y sirve en el momento.",
            ],
            "tags": tags,
            "prep_time_minutes": 25 + (offset % 3) * 5,
        },
    }


def _extract_context_titles(preferences: str, marker: str) -> list[str]:
    if marker not in preferences:
        return []

    for sentence in preferences.split("."):
        if marker not in sentence:
            continue
        _, _, raw_titles = sentence.partition(":")
        return [title.strip() for title in raw_titles.split(",") if title.strip()]
    return []
