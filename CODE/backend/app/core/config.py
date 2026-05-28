from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "development"
    app_secret_key: str = "change-me-in-production"
    app_name: str = "DalalStreet AI"
    app_version: str = "2.0.0"
    debug: bool = False

    kite_api_key: str = ""
    kite_api_secret: str = ""
    kite_access_token: str = ""


    anthropic_api_key: str = ""


    database_url: str = "postgresql+asyncpg://user:pass@localhost/dalalstreet"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "dalalstreet"
    postgres_user: str = "dalalstreet_user"
    postgres_password: str = ""

    # ── Redis ────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── JWT ──────────────────────────────────────────────────
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # ── CORS ─────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # ── Rate Limiting ────────────────────────────────────────
    rate_limit_requests: int = 60
    rate_limit_window: int = 60

    # ── Celery ───────────────────────────────────────────────
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # ── Report Cache ─────────────────────────────────────────
    report_cache_ttl_seconds: int = 300  # 5 minutes


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
