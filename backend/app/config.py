from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent if BACKEND_ROOT.name == "backend" else BACKEND_ROOT
STORAGE_ROOT = PROJECT_ROOT / "storage"


class Settings(BaseSettings):
    project_name: str = "AI Energy Data Analyst"
    api_prefix: str = "/api"
    environment: str = "development"
    database_url: str = f"sqlite:///{(STORAGE_ROOT / 'energy_analytics.db').as_posix()}"
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    upload_dir: Path = STORAGE_ROOT / "uploads"
    dataset_dir: Path = STORAGE_ROOT / "datasets"
    report_dir: Path = PROJECT_ROOT / "reports"
    max_upload_size_mb: int = 50
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    gemini_timeout_seconds: float = 30.0
    auth_secret_key: str = "development-only-change-this-secret"
    access_token_minutes: int = 480
    allow_self_registration: bool = True
    celery_broker_url: str = "memory://"
    celery_result_backend: str = "cache+memory://"
    celery_task_always_eager: bool = True

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return max(self.max_upload_size_mb, 1) * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.dataset_dir.mkdir(parents=True, exist_ok=True)
    settings.report_dir.mkdir(parents=True, exist_ok=True)
    return settings
