from __future__ import annotations

from typing import Any, Protocol

from .. import ai as legacy_ai
from ..config import settings


class ImageProvider(Protocol):
    provider_name: str
    model_name: str
    is_configured: bool

    def resolve_recipe_image(self, recipe: dict[str, Any]) -> dict[str, Any] | None: ...


class GeminiImageProvider:
    provider_name = "gemini"

    @property
    def model_name(self) -> str:
        return settings.gemini_model

    @property
    def is_configured(self) -> bool:
        return settings.has_valid_gemini_api_key

    def resolve_recipe_image(self, recipe: dict[str, Any]) -> dict[str, Any] | None:
        return legacy_ai.resolve_recipe_image(recipe)
