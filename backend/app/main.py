from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from . import ai
from .config import settings
from .database import Base, engine, get_session
from .logging_service import record_exception, record_log
from .models import Ingredient, MenuItem, Recipe, SystemLog, User, WeeklyMenu
from .schemas import (
    GenerateMenuRequest,
    IngredientCreate,
    IngredientOut,
    RecipeCreate,
    RecipeOut,
    RecipeUpdate,
    ReplaceItemRequest,
    SystemLogCreate,
    SystemLogOut,
    UseRecipeRequest,
    WeeklyMenuOut,
)

DEMO_USER_ID = "demo-user"
DEMO_INGREDIENTS = [
    {"name": "Pechuga de pollo", "quantity": "600", "unit": "g", "category": "Proteinas"},
    {"name": "Huevos", "quantity": "8", "unit": "unidades", "category": "Proteinas"},
    {"name": "Garbanzos cocidos", "quantity": "1", "unit": "bote", "category": "Legumbres"},
    {"name": "Arroz basmati", "quantity": "500", "unit": "g", "category": "Cereales"},
    {"name": "Pasta integral", "quantity": "400", "unit": "g", "category": "Cereales"},
    {"name": "Tomate cherry", "quantity": "250", "unit": "g", "category": "Verduras"},
    {"name": "Espinacas", "quantity": "1", "unit": "bolsa", "category": "Verduras"},
    {"name": "Calabacin", "quantity": "2", "unit": "unidades", "category": "Verduras"},
    {"name": "Yogur natural", "quantity": "4", "unit": "unidades", "category": "Lacteos"},
    {"name": "Queso feta", "quantity": "150", "unit": "g", "category": "Lacteos"},
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_recipe_edit_columns()
    with Session(engine) as session:
        ensure_demo_user(session)
        ensure_demo_ingredients(session)
    record_log("info", "backend", "Aplicacion iniciada", {"service": "api", "gemini_model": settings.gemini_model})
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


@app.get("/ingredients", response_model=list[IngredientOut])
def list_ingredients(session: Session = Depends(get_session)) -> list[Ingredient]:
    return list(
        session.scalars(
            select(Ingredient).where(Ingredient.user_id == DEMO_USER_ID).order_by(Ingredient.created_at.desc())
        )
    )


@app.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED)
def create_ingredient(payload: IngredientCreate, session: Session = Depends(get_session)) -> Ingredient:
    ensure_demo_user(session)
    ingredient = Ingredient(user_id=DEMO_USER_ID, **payload.model_dump())
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
) -> list[Recipe]:
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
    return recipes


@app.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeCreate, session: Session = Depends(get_session)) -> Recipe:
    ensure_demo_user(session)
    recipe = Recipe(user_id=DEMO_USER_ID, **payload.model_dump())
    session.add(recipe)
    session.commit()
    session.refresh(recipe)
    return recipe


@app.patch("/recipes/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: str, payload: RecipeUpdate, session: Session = Depends(get_session)) -> Recipe:
    recipe = session.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return recipe

    for field, value in changes.items():
        if isinstance(value, list):
            value = [item.strip() for item in value if item.strip()]
        elif isinstance(value, str):
            value = value.strip()
        setattr(recipe, field, value)

    session.commit()
    session.refresh(recipe)
    record_log(
        "info",
        "database",
        "Receta actualizada",
        {"recipe_id": recipe.id, "updated_fields": sorted(changes.keys())},
    )
    return recipe


@app.delete("/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_recipe(recipe_id: str, session: Session = Depends(get_session)) -> None:
    recipe = session.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    for item in session.scalars(select(MenuItem).where(MenuItem.recipe_id == recipe_id)):
        item.recipe_id = None
    session.delete(recipe)
    session.commit()


@app.post("/recipes/{recipe_id}/variant", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe_variant(
    recipe_id: str,
    payload: ReplaceItemRequest,
    session: Session = Depends(get_session),
) -> Recipe:
    recipe = session.get(Recipe, recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    variant = ai.generate_variant(_recipe_to_dict(recipe), payload.preferences)
    new_recipe = _create_recipe_from_payload(session, variant["recipe"], source="variant")
    session.commit()
    session.refresh(new_recipe)
    record_log(
        "info",
        "ai",
        "Variante de receta creada",
        {"base_recipe_id": recipe_id, "new_recipe_id": new_recipe.id, "title": new_recipe.title},
    )
    return new_recipe


@app.get("/menus/latest", response_model=WeeklyMenuOut | None)
def latest_menu(session: Session = Depends(get_session)) -> dict[str, Any] | None:
    menu = session.scalar(
        select(WeeklyMenu).where(WeeklyMenu.user_id == DEMO_USER_ID).order_by(WeeklyMenu.created_at.desc())
    )
    return serialize_menu(menu) if menu else None


@app.post("/menus/generate", response_model=WeeklyMenuOut, status_code=status.HTTP_201_CREATED)
def generate_menu(payload: GenerateMenuRequest, session: Session = Depends(get_session)) -> dict[str, Any]:
    ensure_demo_user(session)
    ingredients = _ingredient_payloads(session)
    previous_titles = _recent_recipe_titles(session)
    try:
        generated = ai.generate_weekly_menu(ingredients, payload.preferences, previous_titles)
    except Exception as exc:
        record_exception(
            "menu_planning",
            "Fallo generando menu semanal",
            exc,
            {"ingredient_count": len(ingredients), "previous_recipe_count": len(previous_titles)},
        )
        raise HTTPException(status_code=500, detail="No se pudo generar el menu semanal") from exc

    menu = WeeklyMenu(
        user_id=DEMO_USER_ID,
        week_start_date=payload.week_start_date or _current_week_start(),
        preferences={"text": payload.preferences},
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
            "ingredient_count": len(ingredients),
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
    menu = _get_menu(session, menu_id)
    item = _get_menu_item(session, menu_id, item_id)
    try:
        generated = ai.generate_replacement(
            _ingredient_payloads(session),
            payload.preferences,
            _recent_recipe_titles(session),
            item.day_index,
            item.meal_type,
        )
    except Exception as exc:
        record_exception(
            "menu_planning",
            "Fallo sustituyendo plato del menu",
            exc,
            {"menu_id": menu_id, "item_id": item_id, "meal_type": item.meal_type},
        )
        raise HTTPException(status_code=500, detail="No se pudo sustituir el plato") from exc
    recipe = _create_recipe_from_payload(
        session,
        generated["recipe"],
        source=settings.gemini_model if settings.gemini_api_key else "fallback-local",
    )
    item.recipe_id = recipe.id
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
    menu = _get_menu(session, menu_id)
    item = _get_menu_item(session, menu_id, item_id)
    recipe = session.get(Recipe, payload.recipe_id)
    if not recipe or recipe.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    item.recipe_id = recipe.id
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
    user = session.get(User, DEMO_USER_ID)
    if user:
        return user
    user = User(id=DEMO_USER_ID, name="Usuario demo", preferences="")
    session.add(user)
    session.commit()
    return user


def ensure_demo_ingredients(session: Session) -> None:
    has_ingredients = session.scalar(select(Ingredient.id).where(Ingredient.user_id == DEMO_USER_ID).limit(1))
    if has_ingredients:
        return

    session.add_all(Ingredient(user_id=DEMO_USER_ID, **payload) for payload in DEMO_INGREDIENTS)
    session.commit()
    record_log("info", "database", "Ingredientes demo precargados", {"ingredient_count": len(DEMO_INGREDIENTS)})


def ensure_recipe_edit_columns() -> None:
    inspector = inspect(engine)
    if "recipes" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("recipes")}
    statements: list[tuple[str, str]] = []
    if "difficulty" not in columns:
        statements.append(("difficulty", "ALTER TABLE recipes ADD COLUMN difficulty VARCHAR(40) NOT NULL DEFAULT 'Facil'"))
    if "servings" not in columns:
        statements.append(("servings", "ALTER TABLE recipes ADD COLUMN servings INTEGER NOT NULL DEFAULT 2"))

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


def serialize_menu(menu: WeeklyMenu) -> dict[str, Any]:
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
    prep_time_minutes = payload.get("prep_time_minutes", 25)
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
        source=source,
        is_favorite=True,
    )
    session.add(recipe)
    return recipe


def _recipe_to_dict(recipe: Recipe) -> dict[str, Any]:
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
        "source": recipe.source,
        "is_favorite": recipe.is_favorite,
        "created_at": recipe.created_at,
    }


def _difficulty_from_minutes(minutes: int) -> str:
    if minutes <= 30:
        return "Facil"
    if minutes <= 45:
        return "Media"
    return "Elaborada"


def _ingredient_payloads(session: Session) -> list[dict[str, str | None]]:
    ingredients = session.scalars(select(Ingredient).where(Ingredient.user_id == DEMO_USER_ID)).all()
    return [
        {
            "name": ingredient.name,
            "quantity": ingredient.quantity,
            "unit": ingredient.unit,
            "category": ingredient.category,
        }
        for ingredient in ingredients
    ]


def _recent_recipe_titles(session: Session, limit: int = 24) -> list[str]:
    recipes = session.scalars(
        select(Recipe).where(Recipe.user_id == DEMO_USER_ID).order_by(Recipe.created_at.desc()).limit(limit)
    ).all()
    return [recipe.title for recipe in recipes]


def _get_menu(session: Session, menu_id: str) -> WeeklyMenu:
    menu = session.get(WeeklyMenu, menu_id)
    if not menu or menu.user_id != DEMO_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu not found")
    return menu


def _get_menu_item(session: Session, menu_id: str, item_id: str) -> MenuItem:
    item = session.get(MenuItem, item_id)
    if not item or item.menu_id != menu_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    return item


def _current_week_start() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())
