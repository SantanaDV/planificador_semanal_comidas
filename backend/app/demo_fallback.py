from __future__ import annotations

from typing import Any

DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]
MEAL_TYPES = ["comida", "cena"]

RecipePayload = dict[str, Any]
MenuPayload = dict[str, Any]
GenerationContext = dict[str, Any]


def build_weekly_menu(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> MenuPayload:
    items = []
    used_titles: set[str] = set()
    for day_index, _day in enumerate(DAYS):
        for meal_type in MEAL_TYPES:
            offset = day_index * 2 + MEAL_TYPES.index(meal_type)
            items.append(
                build_replacement_item(
                    day_index,
                    meal_type,
                    ingredients,
                    generation_context,
                    offset,
                    used_titles,
                )
            )
    return {
        "items": items,
        "notes": "Menu creado con fallback local controlado para garantizar ejecucion sin clave de Gemini.",
    }


def build_replacement_item(
    day_index: int,
    meal_type: str,
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    offset: int,
    used_titles: set[str] | None = None,
) -> RecipePayload:
    names = [str(item.get("name")).strip() for item in ingredients if item.get("name")]
    if not names:
        names = ["verduras", "arroz", "huevos", "legumbres", "pasta", "pollo", "tomate"]

    recent_titles = {str(title).strip().lower() for title in (generation_context.get("recent_recipe_titles") or []) if str(title).strip()}
    saved_recipes = generation_context.get("compatible_saved_recipes") or []
    used_titles = used_titles if used_titles is not None else set()

    saved_recipe = _pick_saved_recipe(saved_recipes, recent_titles, used_titles)
    if saved_recipe:
        title = str(saved_recipe.get("title") or "Receta guardada compatible")
        used_titles.add(title.lower())
        tags = [str(tag) for tag in (saved_recipe.get("tags") or []) if str(tag).strip()]
        if saved_recipe.get("is_favorite") and "favorita" not in tags:
            tags.append("favorita")
        if "guardada" not in tags:
            tags.append("guardada")
        return {
            "day_index": day_index,
            "day_name": DAYS[day_index],
            "meal_type": meal_type,
            "explanation": "Reutiliza una receta guardada compatible con la nevera actual y las preferencias activas.",
            "recipe": {
                "title": title,
                "description": str(saved_recipe.get("description") or "Receta guardada reutilizada para aprovechar la nevera."),
                "ingredients": [str(value) for value in (saved_recipe.get("ingredients") or []) if str(value).strip()],
                "steps": [str(value) for value in (saved_recipe.get("steps") or []) if str(value).strip()] or [
                    "Prepara los ingredientes disponibles.",
                    "Cocina la receta guardada respetando sus tiempos habituales.",
                    "Sirve en cuanto este lista.",
                ],
                "tags": tags[:8],
                "prep_time_minutes": int(saved_recipe.get("prep_time_minutes") or 25),
                "difficulty": str(saved_recipe.get("difficulty") or "Facil"),
                "servings": int(saved_recipe.get("servings") or 2),
                "image_url": str(saved_recipe.get("image_url") or "")[:500],
                "is_favorite": bool(saved_recipe.get("is_favorite")),
            },
        }

    main = names[offset % len(names)]
    side = names[(offset + 2) % len(names)]
    templates = [
        ("Salteado de {main} con {side}", "Plato rapido pensado para aprovechar ingredientes ya disponibles."),
        ("Horno suave de {main} y {side}", "Preparacion sencilla con dos ingredientes principales de la nevera."),
        ("Plato templado de {main} con {side}", "Combinacion equilibrada para rotar tecnicas sin salir de la nevera."),
        ("Combinado ligero de {main} y {side}", "Receta simple para cubrir un hueco del menu sin inventar ingredientes."),
        ("Plancha de {main} con {side}", "Elaboracion directa y facil con lo que ya tienes disponible."),
        ("Salteado rapido de {side} y {main}", "Alternativa de aprovechamiento con ingredientes reales de la nevera."),
    ]
    title_template, description = templates[offset % len(templates)]
    title = title_template.format(main=main, side=side)
    if title.lower() in used_titles or title.lower() in recent_titles:
        title = f"{title} {DAYS[day_index].lower()}"
    used_titles.add(title.lower())
    tags = ["fallback", "aprovechamiento", meal_type]

    if generation_context.get("preferences_text"):
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


def _pick_saved_recipe(
    saved_recipes: list[dict[str, Any]],
    recent_titles: set[str],
    used_titles: set[str],
) -> dict[str, Any] | None:
    for recipe in saved_recipes:
        title = str(recipe.get("title") or "").strip()
        if not title:
            continue
        normalized_title = title.lower()
        if normalized_title in recent_titles or normalized_title in used_titles:
            continue
        if recipe.get("is_recent"):
            continue
        return recipe
    return None
