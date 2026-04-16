"""Punto de entrada HTTP del backend.

La API mantiene un alcance pequeño para el MVP, pero aquí viven las decisiones
importantes de orquestación: preparación del contexto para IA, validaciones
previas para no gastar cuota, persistencia de menús y política de imágenes.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any
from unicodedata import combining, normalize

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import case, inspect, select, text
from sqlalchemy.orm import Session

from . import ai
from .config import settings
from .database import Base, engine, get_session
from .demo_data import DEFAULT_INGREDIENT_CATEGORIES, DEMO_INGREDIENTS
from .logging_service import record_exception, record_log
from .models import Ingredient, IngredientCategory, MenuItem, Recipe, SystemLog, User, WeeklyMenu
from .schemas import (
    AiStatusOut,
    GenerateMenuRequest,
    IngredientCategoryOut,
    IngredientCreate,
    IngredientOut,
    RecipeCreate,
    RecipeOut,
    RecipeUpdate,
    ReplaceItemRequest,
    ResolveRecipeImagesOut,
    ResolveRecipeImagesRequest,
    SystemLogCreate,
    SystemLogOut,
    UseRecipeRequest,
    WeeklyMenuOut,
)

DEMO_USER_ID = "demo-user"
MIN_INGREDIENTS_FOR_MENU = 5
PANTRY_SUPPORT_BASICS = [
    "aceite de oliva",
    "sal",
    "pimienta",
    "agua",
    "ajo",
    "cebolla",
    "limon",
    "oregano",
    "pimenton dulce",
    "comino",
]
PANTRY_FREE_SUPPORT_BASICS = [
    "aceite de oliva",
    "sal",
    "pimienta",
    "agua",
]
PANTRY_STRUCTURAL_BASICS = [
    "mantequilla",
    "harina",
    "leche",
    "caldo",
    "salsa de tomate basica",
]
PANTRY_BASICS = [*PANTRY_SUPPORT_BASICS, *PANTRY_STRUCTURAL_BASICS]
MAX_PANTRY_INGREDIENTS_PER_RECIPE = 3
MAX_STRUCTURAL_PANTRY_INGREDIENTS_PER_RECIPE = 1
MAX_RECIPE_IMAGE_ATTEMPTS = 3
MAX_RECIPE_IMAGE_CANDIDATES = 6


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Inicializa esquema, datos base y usuario demo antes de aceptar tráfico."""
    Base.metadata.create_all(bind=engine)
    ensure_recipe_edit_columns()
    ensure_ingredient_schema()
    with Session(engine) as session:
        ensure_demo_user(session)
        ensure_ingredient_categories(session)
        backfill_ingredient_categories(session)
        backfill_demo_ingredient_details(session)
    record_log(
        "info",
        "backend",
        "Aplicacion iniciada",
        {
            "service": "api",
            "gemini_model": settings.gemini_model,
            "gemini_configured": settings.has_valid_gemini_api_key,
        },
    )
    yield


app = FastAPI(title="Planificador semanal de comidas", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    record_log(
        "warning" if exc.status_code < 500 else "error",
        "api",
        "HTTPException controlada",
        {
            "method": request.method,
            "path": request.url.path,
            "status_code": exc.status_code,
            "detail": exc.detail,
        },
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    record_exception(
        "api",
        "Error no controlado en API",
        exc,
        {"method": request.method, "path": request.url.path},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ai/status", response_model=AiStatusOut)
def ai_status() -> AiStatusOut:
    """Expone a la UI un estado simple y honesto de la integración IA."""
    configured = settings.has_valid_gemini_api_key
    return AiStatusOut(
        model=settings.gemini_model,
        configured=configured,
        mode="ai" if configured else "fallback",
        message=(
            "Gemini configurado para la generacion del menu semanal"
            if configured
            else "Gemini no esta configurado. La generacion usara fallback local de demo."
        ),
        image_provider="http-search",
        images_enabled=True,
    )


@app.get("/logs", response_model=list[SystemLogOut])
def list_system_logs(
    level: str = Query(default=""),
    module: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> list[SystemLog]:
    statement = select(SystemLog).order_by(SystemLog.created_at.desc()).limit(limit)
    if level:
        statement = statement.where(SystemLog.level == level.strip().lower())
    if module:
        statement = statement.where(SystemLog.module == module.strip())
    return list(session.scalars(statement))


@app.post("/logs", status_code=status.HTTP_202_ACCEPTED)
def create_client_log(payload: SystemLogCreate) -> dict[str, str]:
    record_log(payload.level, payload.module, payload.message, payload.context, payload.stack_trace)
    return {"status": "logged"}


@app.get("/ingredient-categories", response_model=list[IngredientCategoryOut])
def list_ingredient_categories(session: Session = Depends(get_session)) -> list[IngredientCategory]:
    return list(session.scalars(select(IngredientCategory).order_by(IngredientCategory.sort_order, IngredientCategory.name)))


@app.get("/ingredients", response_model=list[IngredientOut])
def list_ingredients(session: Session = Depends(get_session)) -> list[Ingredient]:
    return list(
        session.scalars(
            select(Ingredient)
            .where(Ingredient.user_id == DEMO_USER_ID)
            .order_by(case((Ingredient.expires_at.is_(None), 1), else_=0), Ingredient.expires_at, Ingredient.created_at.desc())
        )
    )


@app.post("/ingredients/demo", response_model=list[IngredientOut], status_code=status.HTTP_201_CREATED)
def create_demo_ingredients(session: Session = Depends(get_session)) -> list[Ingredient]:
    ensure_demo_user(session)
    ensure_ingredient_categories(session)
    categories_by_key = ingredient_category_map(session)
    existing_names = {
        name.strip().lower()
        for name in session.scalars(select(Ingredient.name).where(Ingredient.user_id == DEMO_USER_ID)).all()
    }
    new_ingredients = []
    for payload in DEMO_INGREDIENTS:
        if payload["name"].strip().lower() in existing_names:
            continue
        category = categories_by_key.get(normalize_label(payload.get("category", ""))) or categories_by_key[normalize_label("Otros")]
        new_ingredients.append(
            Ingredient(
                user_id=DEMO_USER_ID,
                name=payload["name"],
                quantity=payload.get("quantity"),
                expires_at=date.today() + timedelta(days=int(payload.get("expires_in_days", 14))),
                category_id=category.id,
                legacy_category=category.name,
            )
        )

    if new_ingredients:
        session.add_all(new_ingredients)
        session.commit()
        for ingredient in new_ingredients:
            session.refresh(ingredient)

    record_log(
        "info",
        "database",
        "Ingredientes demo cargados bajo demanda",
        {"created_count": len(new_ingredients), "requested_count": len(DEMO_INGREDIENTS)},
    )
    return new_ingredients


@app.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED)
def create_ingredient(payload: IngredientCreate, session: Session = Depends(get_session)) -> Ingredient:
    ensure_demo_user(session)
    ensure_ingredient_categories(session)
    category = resolve_ingredient_category(session, payload.category_id)
    ingredient = Ingredient(
        user_id=DEMO_USER_ID,
        name=payload.name.strip(),
        quantity=payload.quantity.strip() if payload.quantity else None,
        expires_at=payload.expires_at,
        category_id=category.id,
        legacy_category=category.name,
    )
    session.add(ingredient)
    session.commit()
    session.refresh(ingredient)
    record_log(
        "info",
        "database",
        "Ingrediente creado",
        {"ingredient_id": ingredient.id, "name": ingredient.name, "category": ingredient.category},
    )
    return ingredient


@app.delete("/ingredients/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_ingredient(ingredient_id: str, session: Session = Depends(get_session)) -> None:
    ingredient = session.get(Ingredient, ingredient_id)
    if not ingredient or ingredient.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    session.delete(ingredient)
    session.commit()
    record_log("info", "database", "Ingrediente eliminado", {"ingredient_id": ingredient_id})


@app.get("/recipes", response_model=list[RecipeOut])
def list_recipes(
    q: str = Query(default=""),
    tag: str = Query(default=""),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    recipes = list(
        session.scalars(select(Recipe).where(Recipe.user_id == DEMO_USER_ID).order_by(Recipe.created_at.desc()))
    )
    query = q.strip().lower()
    tag_query = tag.strip().lower()
    if query:
        recipes = [
            recipe
            for recipe in recipes
            if query in recipe.title.lower()
            or query in recipe.description.lower()
            or any(query in tag_value.lower() for tag_value in recipe.tags)
        ]
    if tag_query:
        recipes = [recipe for recipe in recipes if any(tag_query == tag_value.lower() for tag_value in recipe.tags)]
    return [_recipe_to_dict(recipe) for recipe in recipes]


@app.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeCreate, session: Session = Depends(get_session)) -> dict[str, Any]:
    ensure_demo_user(session)
    data = _recipe_create_payload(payload)
    if not data["ingredients"] or not data["steps"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La receta necesita ingredientes y pasos")
    recipe = Recipe(user_id=DEMO_USER_ID, **data)
    session.add(recipe)
    session.commit()
    session.refresh(recipe)
    record_log(
        "info",
        "database",
        "Receta creada manualmente",
        {"recipe_id": recipe.id, "title": recipe.title, "is_favorite": recipe.is_favorite},
    )
    return _recipe_to_dict(recipe)


@app.patch("/recipes/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: str, payload: RecipeUpdate, session: Session = Depends(get_session)) -> dict[str, Any]:
    recipe = session.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _recipe_to_dict(recipe)

    candidate_index_requested = "image_candidate_index" in changes
    requested_candidate_index = changes.pop("image_candidate_index", None) if candidate_index_requested else None

    for field, value in changes.items():
        if isinstance(value, list):
            value = [item.strip() for item in value if item.strip()]
        elif isinstance(value, str):
            value = value.strip()
            if field in {"image_url", "image_source_url", "image_alt_text", "image_lookup_reason"} and not value:
                value = None
            if field == "image_lookup_status":
                value = _normalize_image_lookup_status(value, changes.get("image_url", recipe.image_url))
        setattr(recipe, field, value)

    if candidate_index_requested:
        candidates = _normalize_image_candidates(recipe.image_candidates)
        if requested_candidate_index is None:
            recipe.image_candidate_index = None
            recipe.image_url = None
            recipe.image_source_url = None
            recipe.image_alt_text = None
            recipe.image_lookup_status = "found" if candidates else "pending"
            recipe.image_lookup_reason = (
                "Has dejado la receta sin foto. Puedes volver a cualquiera de las alternativas guardadas desde el detalle."
                if candidates
                else "La receta no tiene una foto seleccionada."
            )
            recipe.image_lookup_retry_after = None
        else:
            normalized_candidate_index = _normalize_image_candidate_index(requested_candidate_index, len(candidates))
            if normalized_candidate_index is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La alternativa de imagen indicada no existe")
            candidate = candidates[normalized_candidate_index]
            recipe.image_candidate_index = normalized_candidate_index
            recipe.image_url = candidate["image_url"]
            recipe.image_source_url = candidate["image_source_url"]
            recipe.image_alt_text = candidate.get("image_alt_text") or f"Imagen de {recipe.title}."
            recipe.image_lookup_status = "found"
            recipe.image_lookup_reason = (
                f"Imagen seleccionada manualmente ({normalized_candidate_index + 1} de {len(candidates)})."
            )
            recipe.image_lookup_retry_after = None

    if not candidate_index_requested and any(field in changes for field in {"image_url", "image_source_url", "image_alt_text", "image_lookup_status"}):
        recipe.image_candidates = []
        recipe.image_candidate_index = None
        recipe.image_lookup_attempt_count = 0
        recipe.image_lookup_retry_after = None

    session.commit()
    session.refresh(recipe)
    record_log(
        "info",
        "database",
        "Receta actualizada",
        {"recipe_id": recipe.id, "updated_fields": sorted(changes.keys())},
    )
    return _recipe_to_dict(recipe)


@app.post("/recipes/{recipe_id}/resolve-image", response_model=RecipeOut)
def resolve_recipe_image(recipe_id: str, force: bool = Query(default=False), session: Session = Depends(get_session)) -> dict[str, Any]:
    """Resuelve o avanza la imagen de una receta concreta."""
    recipe = session.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    if _image_resolution_cooldown_active(recipe):
        return _recipe_to_dict(recipe)

    if not force and _should_skip_image_resolution(recipe):
        return _recipe_to_dict(recipe)

    image_payload = ai.resolve_recipe_image(_recipe_image_resolution_context(recipe))
    _apply_image_lookup_payload(recipe, image_payload)

    session.commit()
    session.refresh(recipe)
    record_log(
        "info",
        "ai",
        "Resolucion de imagen de receta completada",
        {
            "recipe_id": recipe.id,
            "image_lookup_status": recipe.image_lookup_status,
            "has_image_url": bool(recipe.image_url),
        },
    )
    return _recipe_to_dict(recipe)


@app.post("/recipes/resolve-images", response_model=ResolveRecipeImagesOut)
def resolve_recipe_images(payload: ResolveRecipeImagesRequest, session: Session = Depends(get_session)) -> ResolveRecipeImagesOut:
    """Ejecuta un lote pequeño de resolución de imágenes para la grid de recetas."""
    query = select(Recipe).where(Recipe.user_id == DEMO_USER_ID).order_by(Recipe.created_at.desc())
    recipes = list(session.scalars(query))
    requested_ids = {recipe_id.strip() for recipe_id in payload.recipe_ids if recipe_id.strip()}
    if not requested_ids:
        return ResolveRecipeImagesOut(
            updated_recipes=[],
            attempted_count=0,
            updated_count=0,
            skipped_count=0,
            remaining_pending_count=0,
            stopped_reason=None,
            message="Indica recetas concretas si quieres resolver imagenes en lote.",
        )
    if requested_ids:
        recipes = [recipe for recipe in recipes if recipe.id in requested_ids]

    attempted_count = 0
    skipped_count = 0
    updated_recipes: list[Recipe] = []
    stopped_reason: str | None = None

    for recipe in recipes:
        if attempted_count >= payload.limit:
            break
        if not payload.force and _should_skip_image_resolution(recipe):
            skipped_count += 1
            continue

        image_payload = ai.resolve_recipe_image(_recipe_image_resolution_context(recipe))
        _apply_image_lookup_payload(recipe, image_payload)
        updated_recipes.append(recipe)
        attempted_count += 1

        if recipe.image_lookup_status == "upstream_error":
            stopped_reason = recipe.image_lookup_status
            break

    session.commit()
    for recipe in updated_recipes:
        session.refresh(recipe)

    remaining_pending_count = sum(1 for recipe in recipes if _needs_image_resolution(recipe))
    message = _image_batch_message(updated_recipes, attempted_count, remaining_pending_count, stopped_reason)

    record_log(
        "info" if not stopped_reason else "warning",
        "ai",
        "Resolucion bajo demanda de imagenes de recetas completada",
        {
            "attempted_count": attempted_count,
            "updated_count": len(updated_recipes),
            "skipped_count": skipped_count,
            "remaining_pending_count": remaining_pending_count,
            "stopped_reason": stopped_reason,
        },
    )

    return ResolveRecipeImagesOut(
        updated_recipes=[_recipe_to_dict(recipe) for recipe in updated_recipes],
        attempted_count=attempted_count,
        updated_count=len(updated_recipes),
        skipped_count=skipped_count,
        remaining_pending_count=remaining_pending_count,
        stopped_reason=stopped_reason,
        message=message,
    )


@app.delete("/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_recipe(recipe_id: str, session: Session = Depends(get_session)) -> None:
    recipe = session.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    affected_menu_items = 0
    for item in session.scalars(select(MenuItem).where(MenuItem.recipe_id == recipe_id)):
        item.recipe_id = None
        affected_menu_items += 1
    session.delete(recipe)
    session.commit()
    record_log(
        "info",
        "database",
        "Receta eliminada del recetario",
        {"recipe_id": recipe_id, "affected_menu_items": affected_menu_items},
    )


@app.get("/menus/latest", response_model=WeeklyMenuOut | None)
def latest_menu(session: Session = Depends(get_session)) -> dict[str, Any] | None:
    """Devuelve el último menú semanal persistido para el usuario demo."""
    menu = session.scalar(
        select(WeeklyMenu).where(WeeklyMenu.user_id == DEMO_USER_ID).order_by(WeeklyMenu.created_at.desc())
    )
    return serialize_menu(menu) if menu else None


@app.post("/menus/generate", response_model=WeeklyMenuOut, status_code=status.HTTP_201_CREATED)
def generate_menu(payload: GenerateMenuRequest, session: Session = Depends(get_session)) -> dict[str, Any]:
    """Genera y persiste un menú semanal completo."""
    ensure_demo_user(session)
    all_ingredients = _ingredient_payloads(session)
    excluded_ingredient_names = _excluded_ingredient_names(all_ingredients, payload.excluded_ingredient_ids)
    usable_ingredients = _filter_usable_ingredients(all_ingredients, payload.excluded_ingredient_ids)
    if len(usable_ingredients) < MIN_INGREDIENTS_FOR_MENU:
        record_log(
            "warning",
            "menu_planning",
            "Intento de generar menu con ingredientes insuficientes",
            {
                "user_id": DEMO_USER_ID,
                "ingredient_count": len(all_ingredients),
                "usable_ingredient_count": len(usable_ingredients),
                "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
                "minimum_required": MIN_INGREDIENTS_FOR_MENU,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_insufficient_ingredient_detail(
                ingredient_count=len(all_ingredients),
                usable_ingredient_count=len(usable_ingredients),
                has_exclusions=bool(payload.excluded_ingredient_ids),
            ),
        )

    previous_titles = _previous_menu_recipe_titles(session)
    dietary_rules = ai.infer_dietary_rules(payload.preferences)
    ingredients, diet_removed_ingredient_names = _filter_preference_compatible_ingredients(usable_ingredients, dietary_rules)
    compatible_saved_recipes = _compatible_saved_recipe_context(
        all_ingredients,
        ingredients,
        payload.excluded_ingredient_ids,
        previous_titles,
        session,
        dietary_rules=dietary_rules,
    )
    # Si la nevera ya es inviable con las preferencias actuales, aquí se corta
    # antes de gastar cuota en Gemini y se devuelve un error accionable.
    viability_report = _menu_generation_viability_report(
        preferences=payload.preferences,
        compatible_ingredients=ingredients,
        excluded_ingredient_names=excluded_ingredient_names,
        diet_removed_ingredient_names=diet_removed_ingredient_names,
        compatible_saved_recipes=compatible_saved_recipes,
        dietary_rules=dietary_rules,
    )
    if not viability_report["viable"]:
        record_log(
            "warning",
            "menu_planning",
            "Generacion semanal bloqueada por base de ingredientes incompatible con preferencias",
            {
                "ingredient_count": len(all_ingredients),
                "usable_ingredient_count": len(usable_ingredients),
                "compatible_ingredient_count": len(ingredients),
                "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
                "compatible_recipe_count": len(compatible_saved_recipes),
                **viability_report,
            },
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=viability_report["message"])
    compatible_recipe_titles = [recipe["title"] for recipe in compatible_saved_recipes if not recipe["is_recent"]]
    favorite_recipe_titles = [
        recipe["title"] for recipe in compatible_saved_recipes if recipe["is_favorite"] and not recipe["is_recent"]
    ]
    generation_context = _build_generation_context(
        payload.preferences,
        all_ingredients,
        ingredients,
        payload.excluded_ingredient_ids,
        previous_titles,
        compatible_saved_recipes,
        dietary_rules=dietary_rules,
    )
    try:
        generated = ai.generate_weekly_menu(ingredients, generation_context)
    except ai.WeeklyMenuResolutionError as exc:
        error_type = str(exc.context.get("error_type") or "").strip()
        cooldown_seconds = exc.context.get("cooldown_seconds")
        record_log(
            "warning",
            "menu_planning",
            (
                "Gemini no pudo completar el menu semanal por saturacion temporal"
                if error_type == "rate_limited"
                else "No se pudo cerrar un menu semanal 100% IA tras reparacion dirigida"
            ),
            {
                "ingredient_count": len(all_ingredients),
                "usable_ingredient_count": len(usable_ingredients),
                "compatible_ingredient_count": len(ingredients),
                "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
                "compatible_recipe_count": len(compatible_recipe_titles),
                "favorite_recipe_count": len(favorite_recipe_titles),
                **exc.context,
            },
        )
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
                if error_type == "rate_limited"
                else status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                (
                    (
                        "Gemini esta temporalmente saturado y no ha podido completar el menu semanal. "
                        f"Espera {int(cooldown_seconds)} segundos y vuelve a intentarlo."
                    )
                    if isinstance(cooldown_seconds, int) and cooldown_seconds > 0
                    else "Gemini esta temporalmente saturado y no ha podido completar el menu semanal. "
                    "Espera un momento y vuelve a intentarlo."
                )
                if error_type == "rate_limited"
                else "La IA no pudo cerrar un menu semanal valido con las reglas actuales. "
                "Prueba a regenerar o revisa los ingredientes disponibles."
            ),
        ) from exc
    except Exception as exc:
        record_exception(
            "menu_planning",
            "Fallo generando menu semanal",
            exc,
            {
                "ingredient_count": len(all_ingredients),
                "usable_ingredient_count": len(usable_ingredients),
                "compatible_ingredient_count": len(ingredients),
                "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
                "compatible_recipe_count": len(compatible_recipe_titles),
                "favorite_recipe_count": len(favorite_recipe_titles),
                "previous_recipe_count": len(previous_titles),
            },
        )
        raise HTTPException(status_code=500, detail="No se pudo generar el menu semanal") from exc

    menu = WeeklyMenu(
        user_id=DEMO_USER_ID,
        week_start_date=payload.week_start_date or _current_week_start(),
        preferences={
            "text": payload.preferences,
            "summary": generation_context["preferences_summary"],
            "dietary_rules": generation_context["dietary_rules"],
            "excluded_ingredient_ids": payload.excluded_ingredient_ids,
            "excluded_ingredient_names": generation_context["excluded_ingredient_names"],
            "compatible_recipe_titles": compatible_recipe_titles,
            "favorite_recipe_titles": favorite_recipe_titles,
            "recent_recipe_titles": previous_titles,
            "pantry_basics": PANTRY_BASICS,
        },
        generated_from_ingredients=[ingredient["name"] for ingredient in ingredients if ingredient.get("name")],
        ai_model=generated.get("ai_model", settings.gemini_model),
        notes=generated.get("notes", ""),
    )
    session.add(menu)
    session.flush()

    for index, item_payload in enumerate(generated["items"][:14]):
        normalized = ai.normalize_menu_item(item_payload, index, ingredients)
        recipe = _create_recipe_from_payload(session, normalized["recipe"], source=menu.ai_model)
        session.flush()
        session.add(
            MenuItem(
                menu_id=menu.id,
                recipe_id=recipe.id,
                day_index=normalized["day_index"],
                day_name=normalized["day_name"],
                meal_type=normalized["meal_type"],
                explanation=normalized["explanation"],
            )
        )

    session.commit()
    session.refresh(menu)
    record_log(
        "info",
        "menu_planning",
        "Menu semanal generado",
        {
            "menu_id": menu.id,
            "ai_model": menu.ai_model,
            "ingredient_count": len(all_ingredients),
            "usable_ingredient_count": len(ingredients),
            "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
            "compatible_recipe_count": len(compatible_recipe_titles),
            "favorite_recipe_count": len(favorite_recipe_titles),
            "item_count": len(menu.items),
        },
    )
    return serialize_menu(menu)


@app.post("/menus/{menu_id}/items/{item_id}/replace", response_model=WeeklyMenuOut)
def replace_menu_item(
    menu_id: str,
    item_id: str,
    payload: ReplaceItemRequest,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Regenera un único slot del menú manteniendo las reglas del plan semanal."""
    menu = _get_menu(session, menu_id)
    item = _get_menu_item(session, menu_id, item_id)
    all_ingredients = _ingredient_payloads(session)
    ingredients = _filter_usable_ingredients(all_ingredients, payload.excluded_ingredient_ids)
    if len(ingredients) < MIN_INGREDIENTS_FOR_MENU:
        record_log(
            "warning",
            "menu_planning",
            "Intento de sustituir plato con ingredientes insuficientes",
            {
                "user_id": DEMO_USER_ID,
                "menu_id": menu_id,
                "item_id": item_id,
                "ingredient_count": len(all_ingredients),
                "usable_ingredient_count": len(ingredients),
                "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
                "minimum_required": MIN_INGREDIENTS_FOR_MENU,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_insufficient_ingredient_detail(
                ingredient_count=len(all_ingredients),
                usable_ingredient_count=len(ingredients),
                has_exclusions=bool(payload.excluded_ingredient_ids),
            ),
        )

    recent_titles = _replacement_recipe_titles(session, menu.id)
    dietary_rules = ai.infer_dietary_rules(payload.preferences)
    compatible_saved_recipes = _compatible_saved_recipe_context(
        all_ingredients,
        ingredients,
        payload.excluded_ingredient_ids,
        recent_titles,
        session,
        dietary_rules=dietary_rules,
    )
    compatible_recipe_titles = [recipe["title"] for recipe in compatible_saved_recipes if not recipe["is_recent"]]
    favorite_recipe_titles = [
        recipe["title"] for recipe in compatible_saved_recipes if recipe["is_favorite"] and not recipe["is_recent"]
    ]
    generation_context = _build_generation_context(
        payload.preferences,
        all_ingredients,
        ingredients,
        payload.excluded_ingredient_ids,
        recent_titles,
        compatible_saved_recipes,
        dietary_rules=dietary_rules,
    )
    try:
        generated = ai.generate_replacement(
            ingredients,
            generation_context,
            item.day_index,
            item.meal_type,
        )
    except Exception as exc:
        record_exception(
            "menu_planning",
            "Fallo sustituyendo plato del menu",
            exc,
            {
                "menu_id": menu_id,
                "item_id": item_id,
                "meal_type": item.meal_type,
                "ingredient_count": len(all_ingredients),
                "usable_ingredient_count": len(ingredients),
                "excluded_ingredient_count": len(payload.excluded_ingredient_ids),
                "compatible_recipe_count": len(compatible_recipe_titles),
                "favorite_recipe_count": len(favorite_recipe_titles),
            },
        )
        raise HTTPException(status_code=500, detail="No se pudo sustituir el plato") from exc
    recipe = _create_recipe_from_payload(
        session,
        generated["recipe"],
        source=generated.get("ai_model") or (settings.gemini_model if settings.has_valid_gemini_api_key else "fallback-local"),
    )
    item.recipe_id = recipe.id
    item.recipe = recipe
    item.explanation = generated["explanation"]
    session.commit()
    session.refresh(menu)
    record_log(
        "info",
        "menu_planning",
        "Plato sustituido",
        {"menu_id": menu_id, "item_id": item_id, "recipe_title": recipe.title},
    )
    return serialize_menu(menu)


@app.post("/menus/{menu_id}/items/{item_id}/use-recipe", response_model=WeeklyMenuOut)
def use_saved_recipe(
    menu_id: str,
    item_id: str,
    payload: UseRecipeRequest,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Sustituye un slot por una receta ya guardada por el usuario demo."""
    menu = _get_menu(session, menu_id)
    item = _get_menu_item(session, menu_id, item_id)
    recipe = session.get(Recipe, payload.recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    item.recipe_id = recipe.id
    item.recipe = recipe
    item.explanation = "Receta guardada repetida a peticion del usuario."
    session.commit()
    session.refresh(menu)
    record_log(
        "info",
        "menu_planning",
        "Receta guardada reutilizada en menu",
        {"menu_id": menu_id, "item_id": item_id, "recipe_id": recipe.id},
    )
    return serialize_menu(menu)


def ensure_demo_user(session: Session) -> User:
    """Garantiza la existencia del usuario demo que fija el alcance del MVP."""
    user = session.get(User, DEMO_USER_ID)
    if user:
        return user
    user = User(id=DEMO_USER_ID, name="Usuario demo", preferences="")
    session.add(user)
    session.commit()
    return user


def ensure_recipe_edit_columns() -> None:
    """Añade columnas de edición de recetas cuando se abre una base legacy."""
    inspector = inspect(engine)
    if "recipes" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("recipes")}
    statements: list[tuple[str, str]] = []
    if "difficulty" not in columns:
        statements.append(("difficulty", "ALTER TABLE recipes ADD COLUMN difficulty VARCHAR(40) NOT NULL DEFAULT 'Facil'"))
    if "servings" not in columns:
        statements.append(("servings", "ALTER TABLE recipes ADD COLUMN servings INTEGER NOT NULL DEFAULT 2"))
    if "image_url" not in columns:
        statements.append(("image_url", "ALTER TABLE recipes ADD COLUMN image_url TEXT"))
    if "image_source_url" not in columns:
        statements.append(("image_source_url", "ALTER TABLE recipes ADD COLUMN image_source_url TEXT"))
    if "image_alt_text" not in columns:
        statements.append(("image_alt_text", "ALTER TABLE recipes ADD COLUMN image_alt_text TEXT"))
    if "image_candidates" not in columns:
        statements.append(("image_candidates", "ALTER TABLE recipes ADD COLUMN image_candidates JSON"))
    if "image_candidate_index" not in columns:
        statements.append(("image_candidate_index", "ALTER TABLE recipes ADD COLUMN image_candidate_index INTEGER"))
    if "image_lookup_status" not in columns:
        statements.append(("image_lookup_status", "ALTER TABLE recipes ADD COLUMN image_lookup_status VARCHAR(40)"))
    if "image_lookup_reason" not in columns:
        statements.append(("image_lookup_reason", "ALTER TABLE recipes ADD COLUMN image_lookup_reason TEXT"))
    if "image_lookup_attempt_count" not in columns:
        statements.append(("image_lookup_attempt_count", "ALTER TABLE recipes ADD COLUMN image_lookup_attempt_count INTEGER NOT NULL DEFAULT 0"))
    if "image_lookup_attempted_at" not in columns:
        statements.append(("image_lookup_attempted_at", "ALTER TABLE recipes ADD COLUMN image_lookup_attempted_at TIMESTAMP"))
    if "image_lookup_retry_after" not in columns:
        statements.append(("image_lookup_retry_after", "ALTER TABLE recipes ADD COLUMN image_lookup_retry_after TIMESTAMP"))
    if "is_favorite" not in columns:
        statements.append(("is_favorite", "ALTER TABLE recipes ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT FALSE"))

    if not statements:
        return

    with engine.begin() as connection:
        for _, statement in statements:
            connection.execute(text(statement))

    record_log(
        "info",
        "database",
        "Columnas de edicion de recetas aseguradas",
        {"columns": [column for column, _ in statements]},
    )


def ensure_ingredient_schema() -> None:
    """Asegura columnas nuevas de ingredientes sin requerir migraciones formales."""
    inspector = inspect(engine)
    if "ingredients" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("ingredients")}
    statements: list[tuple[str, str]] = []
    if "expires_at" not in columns:
        statements.append(("expires_at", "ALTER TABLE ingredients ADD COLUMN expires_at DATE"))
    if "category_id" not in columns:
        statements.append(("category_id", "ALTER TABLE ingredients ADD COLUMN category_id VARCHAR(36)"))

    if not statements:
        return

    with engine.begin() as connection:
        for _, statement in statements:
            connection.execute(text(statement))

    record_log(
        "info",
        "database",
        "Columnas de ingredientes aseguradas",
        {"columns": [column for column, _ in statements]},
    )


def ensure_ingredient_categories(session: Session) -> None:
    """Inserta las categorías base que usa la UI para clasificar ingredientes."""
    existing = {
        normalize_label(name)
        for name in session.scalars(select(IngredientCategory.name)).all()
    }
    created = []
    for sort_order, name in enumerate(DEFAULT_INGREDIENT_CATEGORIES):
        if normalize_label(name) in existing:
            continue
        created.append(IngredientCategory(name=name, sort_order=sort_order))

    if not created:
        return

    session.add_all(created)
    session.commit()
    record_log("info", "database", "Categorias iniciales de ingredientes aseguradas", {"created_count": len(created)})


def backfill_ingredient_categories(session: Session) -> None:
    """Vincula ingredientes antiguos a categorías normalizadas del modelo actual."""
    categories_by_key = ingredient_category_map(session)
    fallback = categories_by_key.get(normalize_label("Otros"))
    if not fallback:
        return

    ingredients = session.scalars(
        select(Ingredient).where(Ingredient.category_id.is_(None), Ingredient.user_id == DEMO_USER_ID)
    ).all()
    updated = 0
    for ingredient in ingredients:
        category = categories_by_key.get(normalize_label(ingredient.legacy_category or "")) or fallback
        ingredient.category_id = category.id
        ingredient.legacy_category = category.name
        updated += 1

    if not updated:
        return

    session.commit()
    record_log("info", "database", "Ingredientes legacy vinculados a categorias", {"updated_count": updated})


def backfill_demo_ingredient_details(session: Session) -> None:
    """Rellena metadatos de ingredientes demo creados antes del esquema actual."""
    categories_by_key = ingredient_category_map(session)
    demo_by_name = {payload["name"].strip().lower(): payload for payload in DEMO_INGREDIENTS}
    ingredients = session.scalars(select(Ingredient).where(Ingredient.user_id == DEMO_USER_ID)).all()
    updated = 0

    for ingredient in ingredients:
        payload = demo_by_name.get(ingredient.name.strip().lower())
        if not payload:
            continue

        if ingredient.expires_at is None:
            ingredient.expires_at = date.today() + timedelta(days=int(payload.get("expires_in_days", 14)))
            updated += 1

        expected_quantity = str(payload.get("quantity") or "")
        if expected_quantity and (not ingredient.quantity or " " not in ingredient.quantity):
            ingredient.quantity = expected_quantity
            updated += 1

        category = categories_by_key.get(normalize_label(payload.get("category", "")))
        if category and not ingredient.category_id:
            ingredient.category_id = category.id
            ingredient.legacy_category = category.name
            updated += 1

    if not updated:
        return

    session.commit()
    record_log("info", "database", "Detalles de ingredientes demo legacy actualizados", {"updated_fields": updated})


def ingredient_category_map(session: Session) -> dict[str, IngredientCategory]:
    """Devuelve categorías indexadas por nombre normalizado para búsquedas rápidas."""
    return {
        normalize_label(category.name): category
        for category in session.scalars(select(IngredientCategory)).all()
    }


def resolve_ingredient_category(session: Session, category_id: str | None) -> IngredientCategory:
    """Resuelve la categoría pedida o crea la categoría por defecto si falta."""
    if category_id:
        category = session.get(IngredientCategory, category_id)
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ingredient category not found")
        return category

    category = session.scalar(select(IngredientCategory).where(IngredientCategory.name == "Otros"))
    if category:
        return category

    category = IngredientCategory(name="Otros", sort_order=len(DEFAULT_INGREDIENT_CATEGORIES))
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def normalize_label(value: str) -> str:
    """Normaliza texto para comparaciones tolerantes a mayúsculas y tildes."""
    decomposed = normalize("NFKD", value.strip().casefold())
    return "".join(character for character in decomposed if not combining(character))


def serialize_menu(menu: WeeklyMenu) -> dict[str, Any]:
    """Convierte un menú persistido en la forma estable que consume el frontend."""
    meal_order = {"comida": 0, "cena": 1}
    return {
        "id": menu.id,
        "week_start_date": menu.week_start_date,
        "preferences": menu.preferences or {},
        "generated_from_ingredients": menu.generated_from_ingredients or [],
        "ai_model": menu.ai_model,
        "notes": menu.notes,
        "created_at": menu.created_at,
        "items": [
            {
                "id": item.id,
                "day_index": item.day_index,
                "day_name": item.day_name,
                "meal_type": item.meal_type,
                "explanation": item.explanation,
                "recipe": _recipe_to_dict(item.recipe) if item.recipe else None,
            }
            for item in sorted(
                menu.items,
                key=lambda value: (value.day_index, meal_order.get(value.meal_type, 99)),
            )
        ],
    }


def _create_recipe_from_payload(session: Session, payload: dict[str, Any], source: str) -> Recipe:
    """Persiste una receta generada o manual respetando el contrato común de receta."""
    prep_time_minutes = payload.get("prep_time_minutes", 25)
    image_fields = _normalize_recipe_image_fields(payload)
    persisted_source = str(payload.get("source") or source or "fallback-local").strip()[:120] or "fallback-local"
    recipe = Recipe(
        user_id=DEMO_USER_ID,
        title=payload["title"],
        description=payload.get("description", ""),
        ingredients=payload.get("ingredients", []),
        steps=payload.get("steps", []),
        tags=payload.get("tags", []),
        prep_time_minutes=prep_time_minutes,
        difficulty=payload.get("difficulty") or _difficulty_from_minutes(prep_time_minutes),
        servings=payload.get("servings", 2),
        image_url=image_fields["image_url"],
        image_source_url=image_fields["image_source_url"],
        image_alt_text=image_fields["image_alt_text"],
        image_candidates=image_fields["image_candidates"],
        image_candidate_index=image_fields["image_candidate_index"],
        image_lookup_status=image_fields["image_lookup_status"],
        image_lookup_reason=image_fields["image_lookup_reason"],
        image_lookup_attempt_count=image_fields["image_lookup_attempt_count"],
        source=persisted_source,
        is_favorite=bool(payload.get("is_favorite", False)),
    )
    session.add(recipe)
    return recipe


def _recipe_create_payload(payload: RecipeCreate) -> dict[str, Any]:
    """Limpia el payload de creación manual antes de persistirlo."""
    data = payload.model_dump()
    data["title"] = data["title"].strip()
    data["description"] = data["description"].strip()
    data["ingredients"] = [item.strip() for item in data["ingredients"] if item.strip()]
    data["steps"] = [item.strip() for item in data["steps"] if item.strip()]
    data["tags"] = [item.strip() for item in data["tags"] if item.strip()]
    data["difficulty"] = data["difficulty"].strip()
    data.update(_normalize_recipe_image_fields(data))
    data["source"] = data["source"].strip() or "manual"
    return data


def _recipe_to_dict(recipe: Recipe) -> dict[str, Any]:
    """Serializa una receta con campos derivados de imagen listos para la UI."""
    candidates = _normalize_image_candidates(recipe.image_candidates)
    image_lookup_status = _normalize_image_lookup_status(recipe.image_lookup_status, recipe.image_url)
    candidate_index = _normalize_image_candidate_index(recipe.image_candidate_index, len(candidates))
    attempt_count = max(int(recipe.image_lookup_attempt_count or 0), 0)
    return {
        "id": recipe.id,
        "title": recipe.title,
        "description": recipe.description,
        "ingredients": recipe.ingredients or [],
        "steps": recipe.steps or [],
        "tags": recipe.tags or [],
        "prep_time_minutes": recipe.prep_time_minutes,
        "difficulty": recipe.difficulty or _difficulty_from_minutes(recipe.prep_time_minutes),
        "servings": recipe.servings or 2,
        "image_url": recipe.image_url,
        "image_source_url": recipe.image_source_url,
        "image_alt_text": recipe.image_alt_text,
        "image_candidates": candidates,
        "image_candidate_index": candidate_index,
        "image_lookup_status": image_lookup_status,
        "image_lookup_reason": recipe.image_lookup_reason,
        "image_lookup_attempt_count": attempt_count,
        "image_candidate_count": len(candidates),
        "image_candidate_position": candidate_index + 1 if candidate_index is not None else 0,
        "image_can_retry": _image_can_retry(
            image_lookup_status=image_lookup_status,
            image_url=recipe.image_url,
            candidates=candidates,
            candidate_index=candidate_index,
            attempt_count=attempt_count,
            retry_after=recipe.image_lookup_retry_after,
        ),
        "image_lookup_attempted_at": recipe.image_lookup_attempted_at,
        "image_lookup_retry_after": recipe.image_lookup_retry_after,
        "source": recipe.source,
        "is_favorite": recipe.is_favorite,
        "created_at": recipe.created_at,
    }


def _recipe_image_resolution_context(recipe: Recipe) -> dict[str, Any]:
    """Prepara el contexto mínimo que necesita el resolvedor de imágenes."""
    data = _recipe_to_dict(recipe)
    data["image_candidates"] = _normalize_image_candidates(recipe.image_candidates)
    data["image_candidate_index"] = _normalize_image_candidate_index(
        recipe.image_candidate_index,
        len(data["image_candidates"]),
    )
    return data


def _normalize_recipe_image_fields(value: Any) -> dict[str, Any]:
    """Normaliza payloads de imagen para que manual, batch y retry usen el mismo contrato."""
    payload = value if isinstance(value, dict) else {}
    image_url = _clean_optional_string(payload.get("image_url"), 500)
    image_source_url = _clean_optional_string(payload.get("image_source_url"), 500)
    image_alt_text = _clean_optional_string(payload.get("image_alt_text"), 240)
    image_lookup_reason = _clean_optional_string(payload.get("image_lookup_reason"), 240)
    image_candidates = _normalize_image_candidates(payload.get("image_candidates"))
    image_candidate_index = _normalize_image_candidate_index(payload.get("image_candidate_index"), len(image_candidates))
    image_lookup_attempt_count = max(int(payload.get("image_lookup_attempt_count") or 0), 0)
    image_lookup_status = _normalize_image_lookup_status(payload.get("image_lookup_status"), image_url)
    return {
        "image_url": image_url,
        "image_source_url": image_source_url,
        "image_alt_text": image_alt_text,
        "image_candidates": image_candidates,
        "image_candidate_index": image_candidate_index,
        "image_lookup_status": image_lookup_status,
        "image_lookup_reason": image_lookup_reason,
        "image_lookup_attempt_count": image_lookup_attempt_count,
        "image_lookup_attempted_at": None,
        "image_lookup_retry_after": None,
    }


def _clean_optional_string(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned[:limit] if cleaned else None


def _normalize_image_candidates(value: Any) -> list[dict[str, str]]:
    """Filtra y deduplica candidatos de imagen persistibles."""
    if not isinstance(value, list):
        return []
    candidates: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        image_url = _clean_optional_string(item.get("image_url"), 500)
        image_source_url = _clean_optional_string(item.get("image_source_url"), 500)
        image_alt_text = _clean_optional_string(item.get("image_alt_text"), 240)
        if not image_url or not image_source_url or image_url in seen_urls:
            continue
        seen_urls.add(image_url)
        candidates.append(
            {
                "image_url": image_url,
                "image_source_url": image_source_url,
                "image_alt_text": image_alt_text or "",
            }
        )
        if len(candidates) >= MAX_RECIPE_IMAGE_CANDIDATES:
            break
    return candidates


def _normalize_image_candidate_index(value: Any, candidate_count: int) -> int | None:
    """Valida el índice activo frente al número real de candidatos guardados."""
    if candidate_count <= 0:
        return None
    try:
        index = int(value)
    except (TypeError, ValueError):
        return None
    if index < 0 or index >= candidate_count:
        return None
    return index


def _normalize_image_lookup_status(value: Any, image_url: Any = None) -> str | None:
    """Compacta estados legacy o incompletos a un conjunto pequeño y estable."""
    status = str(value or "").strip().lower()
    if status == "rate_limited":
        status = "pending"
    if status in {"pending", "found", "not_found", "invalid", "attempts_exhausted", "upstream_error"}:
        return status
    if isinstance(image_url, str) and image_url.strip():
        return "found"
    return "pending"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc_datetime(value: datetime | None) -> datetime | None:
    """Fuerza datetimes a UTC para comparar cooldowns sin ambigüedad."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _apply_image_lookup_payload(recipe: Recipe, image_payload: dict[str, Any] | None) -> None:
    """Aplica sobre la receta el resultado normalizado de una resolución de imagen."""
    now = _utcnow()
    payload = image_payload if isinstance(image_payload, dict) else {}
    candidates = _normalize_image_candidates(payload.get("image_candidates"))
    recipe.image_url = _clean_optional_string(payload.get("image_url"), 500)
    recipe.image_source_url = _clean_optional_string(payload.get("image_source_url"), 500)
    recipe.image_alt_text = _clean_optional_string(payload.get("image_alt_text"), 240)
    recipe.image_candidates = candidates
    recipe.image_candidate_index = _normalize_image_candidate_index(payload.get("image_candidate_index"), len(candidates))
    recipe.image_lookup_status = _normalize_image_lookup_status(payload.get("image_lookup_status"), recipe.image_url)
    recipe.image_lookup_reason = _clean_optional_string(payload.get("image_lookup_reason"), 240)
    try:
        recipe.image_lookup_attempt_count = max(int(payload.get("image_lookup_attempt_count") or 0), 0)
    except (TypeError, ValueError):
        recipe.image_lookup_attempt_count = 0
    recipe.image_lookup_attempted_at = now
    recipe.image_lookup_retry_after = _image_retry_after_from_payload(payload, now)


def _image_retry_after_from_payload(payload: dict[str, Any], now: datetime) -> datetime | None:
    """Asigna un pequeño enfriamiento solo a fallos externos recuperables."""
    status = _normalize_image_lookup_status(payload.get("image_lookup_status"))
    if status == "upstream_error":
        return now + timedelta(minutes=5)
    return None


def _needs_image_resolution(recipe: Recipe) -> bool:
    """Decide si merece la pena lanzar búsqueda de imagen para esta receta."""
    if recipe.image_url:
        return False
    if _normalize_image_candidates(recipe.image_candidates):
        return False
    status = _normalize_image_lookup_status(recipe.image_lookup_status)
    if status in {"invalid", "not_found", "attempts_exhausted"}:
        return False
    if status == "upstream_error":
        retry_after = _coerce_utc_datetime(recipe.image_lookup_retry_after)
        return retry_after is None or retry_after <= _utcnow()
    return True


def _image_resolution_cooldown_active(recipe: Recipe) -> bool:
    """Indica si la receta sigue en ventana de espera tras un error externo."""
    status = _normalize_image_lookup_status(recipe.image_lookup_status)
    if status != "upstream_error":
        return False
    retry_after = _coerce_utc_datetime(recipe.image_lookup_retry_after)
    return retry_after is not None and retry_after > _utcnow()


def _should_skip_image_resolution(recipe: Recipe) -> bool:
    """Pequeño wrapper semántico para expresar decisiones del batch de imágenes."""
    return not _needs_image_resolution(recipe)


def _image_batch_message(
    updated_recipes: list[Recipe],
    attempted_count: int,
    remaining_pending_count: int,
    stopped_reason: str | None,
) -> str:
    """Construye un mensaje corto de progreso para la resolución batch de imágenes."""
    if stopped_reason == "upstream_error":
        return "La resolucion de imagenes se ha detenido temporalmente por un error al buscar o validar paginas externas."
    if attempted_count == 0:
        return "No habia recetas nuevas pendientes de resolver imagen."
    found_count = sum(1 for recipe in updated_recipes if recipe.image_lookup_status == "found" and recipe.image_url)
    if remaining_pending_count > 0:
        return f"Se actualizaron {found_count} imagenes y quedan {remaining_pending_count} recetas pendientes."
    return f"Resolucion de imagenes completada. {found_count} recetas tienen foto validada."


def _image_can_retry(
    *,
    image_lookup_status: str | None,
    image_url: str | None,
    candidates: list[dict[str, str]],
    candidate_index: int | None,
    attempt_count: int,
    retry_after: datetime | None,
) -> bool:
    """Expone si la UI puede ofrecer otra acción útil sobre la imagen actual."""
    normalized_status = _normalize_image_lookup_status(image_lookup_status, image_url)
    if normalized_status == "attempts_exhausted":
        return False
    if normalized_status == "upstream_error":
        retry_at = _coerce_utc_datetime(retry_after)
        return retry_at is None or retry_at <= _utcnow()
    if candidates:
        current_index = candidate_index if candidate_index is not None else -1
        return current_index + 1 < len(candidates)
    return normalized_status == "pending"


def _difficulty_from_minutes(minutes: int) -> str:
    """Deriva una dificultad legible para recetas que no la informan explícitamente."""
    if minutes <= 30:
        return "Facil"
    if minutes <= 45:
        return "Media"
    return "Elaborada"


def _ingredient_payloads(session: Session) -> list[dict[str, str | None]]:
    """Recupera ingredientes en el formato plano que consume la capa de IA."""
    ingredients = session.scalars(select(Ingredient).where(Ingredient.user_id == DEMO_USER_ID)).all()
    return [
        {
            "id": ingredient.id,
            "name": ingredient.name,
            "quantity": ingredient.quantity,
            "category": ingredient.category,
            "expires_at": ingredient.expires_at.isoformat() if ingredient.expires_at else None,
        }
        for ingredient in ingredients
    ]


def _filter_usable_ingredients(
    ingredients: list[dict[str, str | None]],
    excluded_ingredient_ids: list[str],
) -> list[dict[str, str | None]]:
    """Elimina ingredientes excluidos manualmente antes de construir contexto."""
    excluded_ids = {ingredient_id.strip() for ingredient_id in excluded_ingredient_ids if ingredient_id.strip()}
    if not excluded_ids:
        return ingredients
    return [ingredient for ingredient in ingredients if ingredient.get("id") not in excluded_ids]


def _excluded_ingredient_names(
    ingredients: list[dict[str, str | None]],
    excluded_ingredient_ids: list[str],
) -> list[str]:
    """Resuelve nombres humanos de los ingredientes excluidos para mensajes y logs."""
    excluded_ids = {ingredient_id.strip() for ingredient_id in excluded_ingredient_ids if ingredient_id.strip()}
    if not excluded_ids:
        return []
    names = [
        str(ingredient.get("name")).strip()
        for ingredient in ingredients
        if ingredient.get("id") in excluded_ids and ingredient.get("name")
    ]
    return _ordered_unique_names(names)


def _filter_preference_compatible_ingredients(
    ingredients: list[dict[str, str | None]],
    dietary_rules: dict[str, Any] | None,
) -> tuple[list[dict[str, str | None]], list[str]]:
    """Retira ingredientes incompatibles con restricciones duras antes de llamar a IA."""
    if not dietary_rules or not dietary_rules.get("strict"):
        return ingredients, []

    compatible: list[dict[str, str | None]] = []
    removed_names: list[str] = []
    for ingredient in ingredients:
        ingredient_name = str(ingredient.get("name") or "").strip()
        if not ingredient_name:
            continue
        conflict = ai.recipe_conflicts_with_dietary_rules(
            {"title": ingredient_name, "ingredients": [ingredient_name]},
            dietary_rules,
        )
        if conflict:
            removed_names.extend(conflict.get("invalid_ingredients") or [ingredient_name])
            continue
        compatible.append(ingredient)
    return compatible, _ordered_unique_names(removed_names)


def _menu_generation_viability_report(
    *,
    preferences: str,
    compatible_ingredients: list[dict[str, str | None]],
    excluded_ingredient_names: list[str],
    diet_removed_ingredient_names: list[str],
    compatible_saved_recipes: list[dict[str, Any]],
    dietary_rules: dict[str, Any] | None,
) -> dict[str, Any]:
    """Evalúa si la nevera resultante tiene base suficiente para pedir un menú semanal.

    La heurística es deliberadamente simple, pero contextual: endurece el mínimo
    cuando el usuario combina restricciones fuertes y alta variedad, y lo relaja
    ligeramente si ya existen varias recetas guardadas compatibles.
    """
    preference_profile = _menu_preference_profile(preferences)
    compatible_names = [
        str(ingredient.get("name")).strip()
        for ingredient in compatible_ingredients
        if ingredient.get("name")
    ]
    category_names = {
        normalize_label(str(ingredient.get("category") or "otros"))
        for ingredient in compatible_ingredients
        if ingredient.get("name")
    }
    compatible_recipe_count = len([recipe for recipe in compatible_saved_recipes if not recipe.get("is_recent")])

    required_ingredient_count = MIN_INGREDIENTS_FOR_MENU
    required_category_count = 2
    limiting_factors: list[str] = []

    if dietary_rules and dietary_rules.get("strict"):
        required_ingredient_count += 1
        labels = ", ".join(str(label) for label in dietary_rules.get("labels") or [])
        limiting_factors.append(f"dieta/restriccion {labels or 'estricta'}")
    if preference_profile["low_carb"]:
        required_ingredient_count += 1
        limiting_factors.append("dieta baja en carbohidratos")
    if preference_profile["variety_level"] == "alta":
        required_ingredient_count += 1
        required_category_count += 1
        limiting_factors.append("variedad semanal alta")
    if (dietary_rules and dietary_rules.get("strict")) and preference_profile["low_carb"]:
        required_category_count = max(required_category_count, 3)
    if compatible_recipe_count >= 3 and required_ingredient_count > MIN_INGREDIENTS_FOR_MENU:
        required_ingredient_count -= 1

    compatible_ingredient_count = len(compatible_names)
    category_count = len(category_names)
    viable = (
        compatible_ingredient_count >= required_ingredient_count
        and category_count >= required_category_count
    )

    diet_removed = _ordered_unique_names(diet_removed_ingredient_names)
    excluded_names = _ordered_unique_names(excluded_ingredient_names)
    message = ""
    if not viable:
        constraints: list[str] = []
        if diet_removed:
            constraints.append("se descartan por dieta/restriccion " + ", ".join(diet_removed[:5]))
        if excluded_names:
            constraints.append("has excluido " + ", ".join(excluded_names[:5]))
        if limiting_factors:
            constraints.append("mantienes " + ", ".join(limiting_factors))
        message = (
            "No hay suficientes ingredientes compatibles con tus preferencias actuales para generar un menu semanal valido. "
            f"Tras aplicar tus filtros solo quedan {compatible_ingredient_count} ingredientes compatibles repartidos en "
            f"{category_count} categorias. Para este caso necesitamos al menos {required_ingredient_count} ingredientes "
            f"compatibles y {required_category_count} categorias distintas."
        )
        if constraints:
            message += " Ahora mismo " + "; ".join(constraints) + "."
        if compatible_recipe_count <= 1:
            message += " Tampoco hay suficientes recetas guardadas compatibles para ampliar opciones."
        message += " Anade mas ingredientes compatibles o relaja alguna preferencia o restriccion."

    return {
        "viable": viable,
        "message": message,
        "compatible_ingredient_count": compatible_ingredient_count,
        "compatible_ingredient_names": compatible_names,
        "compatible_category_count": category_count,
        "compatible_recipe_count": compatible_recipe_count,
        "required_min_ingredients": required_ingredient_count,
        "required_min_categories": required_category_count,
        "limiting_factors": limiting_factors,
        "excluded_ingredient_names": excluded_names,
        "diet_removed_ingredient_names": diet_removed,
    }


def _menu_preference_profile(preferences: str) -> dict[str, Any]:
    """Extrae solo las señales de preferencia que afectan a la viabilidad previa."""
    normalized_preferences = normalize_label(preferences)
    variety_level = "media"
    if "nivel de variedad semanal: alta" in normalized_preferences:
        variety_level = "alta"
    elif "nivel de variedad semanal: baja" in normalized_preferences:
        variety_level = "baja"

    return {
        "low_carb": any(
            label in normalized_preferences
            for label in {"baja en carbohidratos", "bajo en carbohidratos", "low carb", "low-carb"}
        ),
        "variety_level": variety_level,
    }


def _ordered_unique_names(values: list[str]) -> list[str]:
    """Conserva orden humano mientras elimina duplicados por comparación normalizada."""
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        cleaned = str(value or "").strip()
        if not cleaned:
            continue
        key = normalize_label(cleaned)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


def _compatible_saved_recipe_context(
    all_ingredients: list[dict[str, str | None]],
    usable_ingredients: list[dict[str, str | None]],
    excluded_ingredient_ids: list[str],
    recent_recipe_titles: list[str],
    session: Session,
    dietary_rules: dict[str, Any] | None = None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Selecciona recetas guardadas reutilizables dentro de las reglas del contexto.

    Este filtro replica reglas duras del generador: exclusiones manuales,
    restricciones dietarias y política de despensa básica.
    """
    usable_names = {
        normalize_label(str(ingredient.get("name") or ""))
        for ingredient in usable_ingredients
        if ingredient.get("name")
    }
    excluded_ids = {ingredient_id.strip() for ingredient_id in excluded_ingredient_ids if ingredient_id.strip()}
    excluded_names = {
        normalize_label(str(ingredient.get("name") or ""))
        for ingredient in all_ingredients
        if ingredient.get("id") in excluded_ids and ingredient.get("name")
    }
    recent_titles = {normalize_label(title) for title in recent_recipe_titles if title.strip()}
    if not usable_names:
        return []

    recipes = session.scalars(
        select(Recipe)
        .where(Recipe.user_id == DEMO_USER_ID)
        .order_by(Recipe.is_favorite.desc(), Recipe.created_at.desc())
        .limit(50)
    ).all()
    compatible_recipes: list[dict[str, Any]] = []
    for recipe in recipes:
        if ai.recipe_conflicts_with_dietary_rules(
            {
                "title": recipe.title,
                "ingredients": recipe.ingredients or [],
                "description": recipe.description,
                "tags": recipe.tags or [],
            },
            dietary_rules,
        ):
            continue
        recipe_ingredient_names = [
            _normalize_recipe_ingredient_name(str(value))
            for value in (recipe.ingredients or [])
            if str(value).strip()
        ]
        if not recipe_ingredient_names:
            continue
        if excluded_names and any(
            _ingredient_name_matches(recipe_name, excluded_name)
            for recipe_name in recipe_ingredient_names
            for excluded_name in excluded_names
        ):
            continue
        matched_ingredients: list[str] = []
        pantry_ingredients: list[str] = []
        structural_pantry_ingredients: list[str] = []
        incompatible = False
        for recipe_name in recipe_ingredient_names:
            if _is_pantry_basic(recipe_name):
                pantry_ingredients.append(recipe_name)
                if _is_structural_pantry_basic(recipe_name):
                    structural_pantry_ingredients.append(recipe_name)
                continue
            matched_name = next(
                (usable_name for usable_name in usable_names if _ingredient_name_matches(recipe_name, usable_name)),
                None,
            )
            if not matched_name:
                incompatible = True
                break
            matched_ingredients.append(matched_name)

        if (
            incompatible
            or not matched_ingredients
            or not _recipe_uses_reasonable_pantry_support(
                fridge_ingredient_count=len(set(matched_ingredients)),
                pantry_ingredient_count=len(dict.fromkeys(pantry_ingredients)),
                structural_pantry_count=len(dict.fromkeys(structural_pantry_ingredients)),
            )
        ):
            continue
        compatible_recipes.append(
            {
                "id": recipe.id,
                "title": recipe.title,
                "description": recipe.description,
                "ingredients": recipe.ingredients or [],
                "steps": recipe.steps or [],
                "tags": recipe.tags or [],
                "prep_time_minutes": recipe.prep_time_minutes,
                "difficulty": recipe.difficulty or _difficulty_from_minutes(recipe.prep_time_minutes),
                "servings": recipe.servings or 2,
                "image_url": recipe.image_url,
                "image_source_url": recipe.image_source_url,
                "image_alt_text": recipe.image_alt_text,
                "image_lookup_status": _normalize_image_lookup_status(recipe.image_lookup_status, recipe.image_url),
                "image_lookup_reason": recipe.image_lookup_reason,
                "source": recipe.source,
                "is_favorite": recipe.is_favorite,
                "is_recent": normalize_label(recipe.title) in recent_titles,
                "matched_ingredient_names": sorted(set(matched_ingredients)),
                "matched_ingredient_count": len(set(matched_ingredients)),
                "created_at": recipe.created_at.isoformat() if recipe.created_at else "",
            }
        )

    compatible_recipes.sort(
        key=lambda recipe: (
            not bool(recipe["is_favorite"]),
            bool(recipe["is_recent"]),
            -int(recipe["matched_ingredient_count"]),
            recipe["created_at"],
        )
    )
    return compatible_recipes[:limit]


def _normalize_recipe_ingredient_name(value: str) -> str:
    """Limpia adornos comunes de ingredientes guardados antes de compararlos."""
    name = value.split(" - ", 1)[0].split(":", 1)[0]
    return normalize_label(name)


def _ingredient_name_matches(recipe_name: str, fridge_name: str) -> bool:
    """Hace matching tolerante entre nevera y receta sin caer en substring ingenuo."""
    if len(recipe_name) < 3 or len(fridge_name) < 3:
        return False
    if recipe_name == fridge_name:
        return True
    recipe_tokens = _ingredient_match_tokens(recipe_name)
    fridge_tokens = _ingredient_match_tokens(fridge_name)
    if not recipe_tokens or not fridge_tokens:
        return False
    shorter, longer = (
        (recipe_tokens, fridge_tokens)
        if len(recipe_tokens) <= len(fridge_tokens)
        else (fridge_tokens, recipe_tokens)
    )
    return all(token in longer for token in shorter)


def _ingredient_match_tokens(value: str) -> list[str]:
    """Tokeniza nombres de ingrediente eliminando ruido frecuente en castellano."""
    stopwords = {"de", "del", "la", "el", "los", "las", "y", "con", "al", "a", "en"}
    tokens = [token for token in value.split() if token]
    normalized_tokens = []
    for token in tokens:
        if token in stopwords:
            continue
        if len(token) > 4 and token.endswith("s"):
            token = token[:-1]
        normalized_tokens.append(token)
    return normalized_tokens


def _is_pantry_basic(recipe_name: str) -> bool:
    """Marca ingredientes permitidos como apoyo aunque no estén en la nevera."""
    return any(_ingredient_name_matches(recipe_name, normalize_label(value)) for value in PANTRY_BASICS)


def _is_structural_pantry_basic(recipe_name: str) -> bool:
    """Distingue básicos de despensa que cambian más la estructura del plato."""
    return any(_ingredient_name_matches(recipe_name, normalize_label(value)) for value in PANTRY_STRUCTURAL_BASICS)


def _recipe_uses_reasonable_pantry_support(
    *,
    fridge_ingredient_count: int,
    pantry_ingredient_count: int,
    structural_pantry_count: int,
) -> bool:
    """Aplica la política MVP para que la despensa siga siendo apoyo y no base."""
    if fridge_ingredient_count <= 0:
        return False
    if pantry_ingredient_count > MAX_PANTRY_INGREDIENTS_PER_RECIPE:
        return False
    if fridge_ingredient_count > 1 and pantry_ingredient_count > fridge_ingredient_count:
        return False
    if structural_pantry_count > MAX_STRUCTURAL_PANTRY_INGREDIENTS_PER_RECIPE:
        return False
    if fridge_ingredient_count == 1 and pantry_ingredient_count > 2:
        return False
    if fridge_ingredient_count == 1 and structural_pantry_count > 0:
        return False
    return True


def _build_generation_context(
    preferences: str,
    all_ingredients: list[dict[str, str | None]],
    usable_ingredients: list[dict[str, str | None]],
    excluded_ingredient_ids: list[str],
    recent_recipe_titles: list[str],
    compatible_saved_recipes: list[dict[str, Any]],
    dietary_rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compone el contexto único que comparte generación semanal y sustituciones."""
    excluded_ids = {ingredient_id.strip() for ingredient_id in excluded_ingredient_ids if ingredient_id.strip()}
    excluded_ingredient_names = [
        str(ingredient.get("name"))
        for ingredient in all_ingredients
        if ingredient.get("id") in excluded_ids and ingredient.get("name")
    ]
    compatible_recipe_titles = [recipe["title"] for recipe in compatible_saved_recipes if not recipe["is_recent"]]
    favorite_recipe_titles = [
        recipe["title"] for recipe in compatible_saved_recipes if recipe["is_favorite"] and not recipe["is_recent"]
    ]
    return {
        "preferences_text": preferences.strip(),
        "preferences_summary": _preferences_with_compatible_recipes(
            preferences,
            compatible_recipe_titles,
            favorite_recipe_titles,
        ),
        "available_ingredients": ingredients_for_generation(usable_ingredients),
        "excluded_ingredient_names": excluded_ingredient_names,
        "recent_recipe_titles": recent_recipe_titles,
        "compatible_saved_recipes": compatible_saved_recipes,
        "compatible_recipe_titles": compatible_recipe_titles,
        "favorite_recipe_titles": favorite_recipe_titles,
        "dietary_rules": dietary_rules or {},
        "pantry_basics": PANTRY_BASICS,
        "pantry_support_basics": PANTRY_SUPPORT_BASICS,
        "pantry_free_support_basics": PANTRY_FREE_SUPPORT_BASICS,
        "pantry_structural_basics": PANTRY_STRUCTURAL_BASICS,
        "pantry_policy": {
            "max_pantry_ingredients_per_recipe": MAX_PANTRY_INGREDIENTS_PER_RECIPE,
            "max_structural_pantry_ingredients_per_recipe": MAX_STRUCTURAL_PANTRY_INGREDIENTS_PER_RECIPE,
            "single_fridge_ingredient_allows_structural_pantry": False,
            "single_fridge_ingredient_max_pantry": 2,
            "free_support_basics_do_not_count": True,
        },
    }


def ingredients_for_generation(ingredients: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    """Reduce el payload de ingredientes al mínimo útil para el modelo."""
    return [
        {
            "name": ingredient.get("name"),
            "quantity": ingredient.get("quantity"),
            "category": ingredient.get("category"),
            "expires_at": ingredient.get("expires_at"),
        }
        for ingredient in ingredients
        if ingredient.get("name")
    ]


def _preferences_with_compatible_recipes(
    preferences: str,
    compatible_recipe_titles: list[str],
    favorite_recipe_titles: list[str],
) -> str:
    """Refuerza el prompt con recordatorios de reutilización y política de despensa."""
    parts = [preferences.strip()]
    parts.append(
        "Usa la nevera real como base del menu y no introduzcas ingredientes principales fuera de lo disponible."
    )
    if favorite_recipe_titles:
        parts.append(
            "Recetas favoritas compatibles que debes priorizar si encajan sin forzarlas: "
            + ", ".join(favorite_recipe_titles)
            + "."
        )
    if compatible_recipe_titles:
        parts.append(
            "Recetas guardadas compatibles que puedes reutilizar si encajan: "
            + ", ".join(compatible_recipe_titles)
            + "."
        )
    if PANTRY_BASICS:
        parts.append(
            "Basicos de despensa permitidos solo como apoyo y nunca como ingrediente principal: "
            + ", ".join(PANTRY_BASICS)
            + "."
        )
        parts.append(
            "No debe haber mas ingredientes de despensa que ingredientes reales de nevera en una receta, "
            f"y solo se permite un ingrediente estructural de despensa por plato."
        )
    return " ".join(part for part in parts if part)


def _insufficient_ingredient_detail(
    ingredient_count: int,
    usable_ingredient_count: int,
    has_exclusions: bool,
) -> str:
    """Devuelve mensajes de error accionables para neveras insuficientes."""
    if ingredient_count == 0:
        return "Anade ingredientes antes de generar el menu o carga ingredientes de prueba."
    if has_exclusions:
        return (
            f"Tras aplicar tus exclusiones quedan {usable_ingredient_count} ingredientes disponibles. "
            f"Necesitas al menos {MIN_INGREDIENTS_FOR_MENU} ingredientes para generar un menu semanal util."
        )
    return f"Necesitas al menos {MIN_INGREDIENTS_FOR_MENU} ingredientes para generar un menu semanal util."


def _previous_menu_recipe_titles(session: Session, exclude_menu_id: str | None = None) -> list[str]:
    """Recupera títulos del menú anterior para preservar variedad intersemanal."""
    statement = (
        select(WeeklyMenu)
        .where(WeeklyMenu.user_id == DEMO_USER_ID)
        .order_by(WeeklyMenu.week_start_date.desc(), WeeklyMenu.created_at.desc())
    )
    if exclude_menu_id:
        statement = statement.where(WeeklyMenu.id != exclude_menu_id)
    menu = session.scalar(statement)
    if not menu:
        return []
    return [item.recipe.title for item in menu.items if item.recipe and item.recipe.title]


def _replacement_recipe_titles(session: Session, menu_id: str) -> list[str]:
    """Une títulos del menú actual y del anterior para evitar repeticiones al reemplazar."""
    current_menu = _get_menu(session, menu_id)
    current_titles = [item.recipe.title for item in current_menu.items if item.recipe and item.recipe.title]
    previous_titles = _previous_menu_recipe_titles(session, exclude_menu_id=menu_id)
    seen: set[str] = set()
    ordered_titles: list[str] = []
    for title in current_titles + previous_titles:
        normalized_title = normalize_label(title)
        if normalized_title in seen:
            continue
        seen.add(normalized_title)
        ordered_titles.append(title)
    return ordered_titles


def _get_menu(session: Session, menu_id: str) -> WeeklyMenu:
    """Carga un menú asegurando que pertenece al usuario demo."""
    menu = session.get(WeeklyMenu, menu_id)
    if not menu or menu.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")
    return menu


def _get_menu_item(session: Session, menu_id: str, item_id: str) -> MenuItem:
    """Carga un slot concreto validando que pertenece al menú solicitado."""
    item = session.get(MenuItem, item_id)
    if not item or item.menu_id != menu_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    return item


def _current_week_start() -> date:
    """Calcula el lunes de la semana actual para agrupar menús semanales."""
    today = date.today()
    return today - timedelta(days=today.weekday())
