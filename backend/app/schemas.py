from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: str | None = Field(default=None, max_length=80)
    unit: str | None = Field(default=None, max_length=40)
    category: str | None = Field(default=None, max_length=80)


class IngredientOut(IngredientCreate):
    id: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = ""
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    prep_time_minutes: int = 25
    source: str = "manual"


class RecipeOut(RecipeCreate):
    id: str
    is_favorite: bool = True
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


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
