from __future__ import annotations

from functools import lru_cache
from typing import Any

from .. import ai as legacy_ai
from ..config import settings
from ..logging_service import record_log
from ..providers.text import DeterministicTextProvider, GeminiTextProvider, TextProvider

GenerationContext = dict[str, Any]
MenuPayload = dict[str, Any]
RecipePayload = dict[str, Any]
WeeklyMenuResolutionError = legacy_ai.WeeklyMenuResolutionError


class TextGenerationService:
    def __init__(self, provider: TextProvider) -> None:
        self.provider = provider

    @property
    def provider_name(self) -> str:
        return self.provider.provider_name

    @property
    def model_name(self) -> str:
        return self.provider.model_name

    @property
    def is_configured(self) -> bool:
        return self.provider.is_configured

    @property
    def mode(self) -> str:
        return self.provider.mode

    def status_message(self, *, image_provider_name: str | None = None) -> str:
        suffix = (
            f" La resolucion de imagenes usa {image_provider_name} bajo demanda."
            if image_provider_name
            else ""
        )
        if self.provider_name == "gemini":
            if self.is_configured:
                return (
                    "Proveedor de texto actual: Gemini. El menu semanal se genera con IA real, "
                    "prioriza la nevera y admite una despensa basica limitada."
                    f"{suffix}"
                )
            return (
                "Proveedor de texto actual: Gemini, pero no esta configurado. "
                "La generacion usara fallback local de demo."
                f"{suffix}"
            )
        return (
            "Proveedor de texto actual: deterministic-local. La generacion textual usa el proveedor "
            "local determinista de demo."
            f"{suffix}"
        )

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        payload = self.provider.generate_weekly_menu(ingredients, generation_context)
        if isinstance(payload, dict) and not payload.get("ai_model"):
            payload["ai_model"] = self.model_name
        return payload

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        payload = self.provider.generate_replacement(ingredients, generation_context, day_index, meal_type)
        if isinstance(payload, dict) and not payload.get("ai_model"):
            payload["ai_model"] = self.model_name
        return payload

    def normalize_menu_item(
        self,
        item: dict[str, Any],
        fallback_index: int,
        ingredients: list[dict[str, str | None]],
    ) -> RecipePayload:
        return legacy_ai.normalize_menu_item(item, fallback_index, ingredients)


@lru_cache
def get_text_generation_service() -> TextGenerationService:
    provider_name = (settings.text_ai_provider or "").strip().lower()
    if provider_name == "deterministic":
        return TextGenerationService(DeterministicTextProvider())
    if provider_name not in {"", "gemini"}:
        record_log(
            "warning",
            "backend",
            "Proveedor de texto no reconocido; se usa Gemini por defecto",
            {"requested_provider": settings.text_ai_provider},
        )
    return TextGenerationService(GeminiTextProvider())
