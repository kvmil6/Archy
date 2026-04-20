from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent

class Settings(BaseSettings):
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:5174,http://localhost:5175,"
        "http://localhost:5176,http://localhost:5177,http://localhost:5178,"
        "http://localhost:5179,http://localhost:5180,http://localhost:3000,"
        "http://localhost:4173,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,"
        "http://127.0.0.1:5176,http://127.0.0.1:5177,http://127.0.0.1:5178,"
        "http://127.0.0.1:5179,http://127.0.0.1:5180,http://127.0.0.1:3000"
    )

    ARCHY_LINK_PORT: int = 47291
    ARCHY_OUTPUT_DIR: str = str(Path.home() / ".archy" / "projects")

    AVAILABLE_MODELS: str = "anthropic/claude-opus-4.7,google/gemini-3.1-pro-preview,anthropic/claude-sonnet-4.6,google/gemma-4-31b-it:free,minimax/minimax-m2.5:free,openai/gpt-oss-120b:free,qwen/qwen3-coder:free"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
    
    @property
    def available_models_list(self) -> List[str]:
        return [m.strip() for m in self.AVAILABLE_MODELS.split(",") if m.strip()]

    def resolve_model(self, requested: Optional[str] = None, prefer_free: bool = True) -> str:
        if requested and requested.strip():
            return requested.strip()

        models = self.available_models_list
        if prefer_free:
            free_model = next((m for m in models if ":free" in m), None)
            if free_model:
                return free_model

        if models:
            return models[0]

        return "qwen/qwen3-coder:free"
    
    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(REPO_DIR / ".env")),
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()