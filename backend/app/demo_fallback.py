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


def build_variant(recipe: dict[str, Any]) -> dict[str, Any]:
    base_title = recipe.get("title") or "receta guardada"
    return {
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
    }
