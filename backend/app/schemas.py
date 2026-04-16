"""Esquemas Pydantic que definen el contrato HTTP del backend.

Se usan tanto para validar peticiones como para hacer explícito qué partes del
modelo relacional se exponen al frontend y cuáles se mantienen internas.
"""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class IngredientCreate(BaseModel):
    """Payload mínimo para crear un ingrediente desde la UI."""

    name: str = Field(min_length=1, max_length=120)
    quantity: str | None = Field(default=None, max_length=80)
    category_id: str | None = Field(default=None, max_length=36)
    expires_at: date | None = None


class IngredientOut(BaseModel):
    """Ingrediente serializado con la categoría ya resuelta para la UI."""

    id: str
    name: str
    quantity: str | None = None
    category_id: str | None = None
    category: str | None = None
    expires_at: date | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class IngredientCategoryOut(BaseModel):
    """Categoría disponible para altas y filtros de ingredientes."""

    id: str
    name: str
    sort_order: int = 0
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AiStatusOut(BaseModel):
    """Estado simplificado de la integración IA mostrado en frontend."""

    provider: str = "gemini"
    model: str
    configured: bool
    mode: Literal["ai", "fallback"]
    message: str
    image_provider: str = "http-search"
    images_enabled: bool = True


ImageLookupStatus = Literal["pending", "found", "not_found", "invalid", "attempts_exhausted", "upstream_error"]


class RecipeImageCandidateOut(BaseModel):
    """Candidato cacheado de imagen navegable desde el detalle de receta."""

    image_url: str = Field(max_length=500)
    image_source_url: str = Field(max_length=500)
    image_alt_text: str | None = Field(default=None, max_length=240)


class RecipeCreate(BaseModel):
    """Contrato base para crear o serializar una receta editable."""

    title: str = Field(min_length=1, max_length=180)
    description: str = ""
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    prep_time_minutes: int = Field(default=25, ge=5, le=240)
    difficulty: str = Field(default="Facil", min_length=1, max_length=40)
    servings: int = Field(default=2, ge=1, le=12)
    image_url: str | None = Field(default=None, max_length=500)
    image_source_url: str | None = Field(default=None, max_length=500)
    image_alt_text: str | None = Field(default=None, max_length=240)
    image_lookup_status: ImageLookupStatus | None = None
    image_lookup_reason: str | None = Field(default=None, max_length=240)
    source: str = "manual"
    is_favorite: bool = False


class RecipeOut(RecipeCreate):
    """Receta expuesta al frontend con estado completo de imagen y metadatos."""

    id: str
    image_candidates: list[RecipeImageCandidateOut] = Field(default_factory=list)
    image_candidate_index: int | None = None
    image_lookup_attempt_count: int = 0
    image_candidate_count: int = 0
    image_candidate_position: int = 0
    image_can_retry: bool = False
    image_lookup_attempted_at: datetime | None = None
    image_lookup_retry_after: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RecipeUpdate(BaseModel):
    """Actualización parcial de una receta ya existente."""

    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    ingredients: list[str] | None = None
    steps: list[str] | None = None
    tags: list[str] | None = None
    prep_time_minutes: int | None = Field(default=None, ge=5, le=240)
    difficulty: str | None = Field(default=None, min_length=1, max_length=40)
    servings: int | None = Field(default=None, ge=1, le=12)
    image_url: str | None = Field(default=None, max_length=500)
    image_source_url: str | None = Field(default=None, max_length=500)
    image_alt_text: str | None = Field(default=None, max_length=240)
    image_candidate_index: int | None = None
    image_lookup_status: ImageLookupStatus | None = None
    image_lookup_reason: str | None = Field(default=None, max_length=240)
    is_favorite: bool | None = None


class ResolveRecipeImagesRequest(BaseModel):
    """Petición batch para resolver imágenes de un conjunto acotado de recetas."""

    recipe_ids: list[str] = Field(default_factory=list)
    limit: int = Field(default=4, ge=1, le=8)
    force: bool = False


class ResolveRecipeImagesOut(BaseModel):
    """Resumen del lote de resolución de imágenes ejecutado por backend."""

    updated_recipes: list[RecipeOut] = Field(default_factory=list)
    attempted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    remaining_pending_count: int = 0
    stopped_reason: ImageLookupStatus | None = None
    message: str


class MenuItemOut(BaseModel):
    """Slot individual de comida o cena dentro del menú semanal serializado."""

    id: str
    day_index: int
    day_name: str
    meal_type: str
    explanation: str
    recipe: RecipeOut | None


class WeeklyMenuOut(BaseModel):
    """Respuesta completa del menú semanal usado por dashboard y detalle."""

    id: str
    week_start_date: date
    preferences: dict
    generated_from_ingredients: list[str]
    ai_model: str
    notes: str
    created_at: datetime | None = None
    items: list[MenuItemOut]


class GenerateMenuRequest(BaseModel):
    """Entrada de generación semanal basada en preferencias y exclusiones."""

    preferences: str = ""
    excluded_ingredient_ids: list[str] = Field(default_factory=list)
    week_start_date: date | None = None


class ReplaceItemRequest(BaseModel):
    """Entrada para regenerar un único slot manteniendo el resto del menú."""

    preferences: str = ""
    excluded_ingredient_ids: list[str] = Field(default_factory=list)


class UseRecipeRequest(BaseModel):
    """Entrada mínima para fijar una receta guardada en un slot del menú."""

    recipe_id: str


class SystemLogCreate(BaseModel):
    """Evento estructurado enviado por frontend o backend a `system_logs`."""

    level: Literal["info", "warning", "error"] = "info"
    module: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)
    stack_trace: str | None = None


class SystemLogOut(SystemLogCreate):
    """Representación pública de un log persistido."""

    id: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
