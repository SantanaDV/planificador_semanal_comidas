from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./local.db"
    cors_origins: str = "http://localhost:3000"
    text_ai_provider: str = "gemini"
    image_ai_provider: str = "gemini"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_enable_google_search: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_valid_gemini_api_key(self) -> bool:
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
    return Settings()


settings = get_settings()
