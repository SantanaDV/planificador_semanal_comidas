from __future__ import annotations

from typing import Any, Literal, Protocol

from .. import ai as legacy_ai
from ..config import settings
from ..demo_fallback import build_replacement_item, build_weekly_menu

GenerationContext = dict[str, Any]
MenuPayload = dict[str, Any]
RecipePayload = dict[str, Any]


class TextProvider(Protocol):
    provider_name: str
    model_name: str
    mode: Literal["ai", "fallback"]
    is_configured: bool

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload: ...

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload: ...


class GeminiTextProvider:
    provider_name = "gemini"

    @property
    def model_name(self) -> str:
        return settings.gemini_model

    @property
    def mode(self) -> Literal["ai", "fallback"]:
        return "ai" if self.is_configured else "fallback"

    @property
    def is_configured(self) -> bool:
        return settings.has_valid_gemini_api_key

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        return legacy_ai.generate_weekly_menu(ingredients, generation_context)

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        return legacy_ai.generate_replacement(ingredients, generation_context, day_index, meal_type)


class DeterministicTextProvider:
    provider_name = "deterministic"
    model_name = "deterministic-local"
    mode: Literal["fallback"] = "fallback"
    is_configured = True

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        payload = build_weekly_menu(ingredients, generation_context)
        payload["ai_model"] = self.model_name
        return payload

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        payload = build_replacement_item(day_index, meal_type, ingredients, generation_context, offset=5)
        payload["ai_model"] = self.model_name
        return payload
