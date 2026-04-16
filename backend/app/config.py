"""Configuración central del backend.

Este módulo concentra únicamente ajustes de infraestructura y banderas de
integración. La lógica de negocio y las decisiones de fallback se resuelven en
otros módulos a partir de estos valores ya normalizados.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros de entorno usados por la API.

    Se exponen como propiedades calculadas para que el resto del código no tenga
    que repetir comprobaciones sobre placeholders, listas CORS o claves vacías.
    """

    database_url: str = "sqlite:///./local.db"
    cors_origins: str = "http://localhost:3000"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_enable_google_search: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        """Devuelve la lista de orígenes permitidos ya limpia para FastAPI."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_valid_gemini_api_key(self) -> bool:
        """Detecta claves plausibles y descarta placeholders comunes del README."""
        key = (self.gemini_api_key or "").strip()
        if not key:
            return False

        normalized = key.lower()
        placeholders = {"tu_clave", "your_api_key", "your_key", "replace_me", "changeme", "api_key"}
        if normalized in placeholders or "placeholder" in normalized:
            return False

        return key.startswith("AIza") or len(key) >= 24


@lru_cache
def get_settings() -> Settings:
    """Memoiza la carga de configuración para evitar releer `.env` en cada import."""
    return Settings()


settings = get_settings()
