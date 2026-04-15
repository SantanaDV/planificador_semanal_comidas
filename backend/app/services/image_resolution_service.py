from __future__ import annotations

from functools import lru_cache
from typing import Any

from ..config import settings
from ..logging_service import record_log
from ..providers.image import GeminiImageProvider, ImageProvider


class ImageResolutionService:
    def __init__(self, provider: ImageProvider) -> None:
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

    def resolve_recipe_image(self, recipe: dict[str, Any]) -> dict[str, Any] | None:
        return self.provider.resolve_recipe_image(recipe)


@lru_cache
def get_image_resolution_service() -> ImageResolutionService:
    provider_name = (settings.image_ai_provider or "").strip().lower()
    if provider_name not in {"", "gemini"}:
        record_log(
            "warning",
            "backend",
            "Proveedor de imagen no reconocido; se usa Gemini por defecto",
            {"requested_provider": settings.image_ai_provider},
        )
    return ImageResolutionService(GeminiImageProvider())
