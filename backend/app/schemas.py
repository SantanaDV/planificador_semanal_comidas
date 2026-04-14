from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: str | None = Field(default=None, max_length=80)
    category_id: str | None = Field(default=None, max_length=36)
    expires_at: date | None = None


class IngredientOut(BaseModel):
    id: str
    name: str
    quantity: str | None = None
    category_id: str | None = None
    category: str | None = None
    expires_at: date | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class IngredientCategoryOut(BaseModel):
    id: str
    name: str
    sort_order: int = 0
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AiStatusOut(BaseModel):
    provider: str = "gemini"
    model: str
    configured: bool
    mode: Literal["ai", "fallback"]
    message: str


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = ""
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    prep_time_minutes: int = Field(default=25, ge=5, le=240)
    difficulty: str = Field(default="Facil", min_length=1, max_length=40)
    servings: int = Field(default=2, ge=1, le=12)
    source: str = "manual"


class RecipeOut(RecipeCreate):
    id: str
    is_favorite: bool = True
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RecipeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    ingredients: list[str] | None = None
    steps: list[str] | None = None
    tags: list[str] | None = None
    prep_time_minutes: int | None = Field(default=None, ge=5, le=240)
    difficulty: str | None = Field(default=None, min_length=1, max_length=40)
    servings: int | None = Field(default=None, ge=1, le=12)


class MenuItemOut(BaseModel):
    id: str
    day_index: int
    day_name: str
    meal_type: str
    explanation: str
    recipe: RecipeOut | None


class WeeklyMenuOut(BaseModel):
    id: str
    week_start_date: date
    preferences: dict
    generated_from_ingredients: list[str]
    ai_model: str
    notes: str
    created_at: datetime | None = None
    items: list[MenuItemOut]


class GenerateMenuRequest(BaseModel):
    preferences: str = ""
    week_start_date: date | None = None


class ReplaceItemRequest(BaseModel):
    preferences: str = ""


class UseRecipeRequest(BaseModel):
    recipe_id: str


class SystemLogCreate(BaseModel):
    level: Literal["info", "warning", "error"] = "info"
    module: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)
    stack_trace: str | None = None


class SystemLogOut(SystemLogCreate):
    id: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
