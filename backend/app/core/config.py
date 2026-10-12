from __future__ import annotations

import json
import ipaddress
from functools import lru_cache
from typing import Any, List, Optional

from pydantic import Field, SecretStr, field_validator, IPvAnyNetwork
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ----- Database (optional override for SQLite/local dev) --------------------
    # When set, DATABASE_URL takes priority and overrides the per-field MySQL
    # variables below. Useful for local native development without Docker/MySQL.
    # Examples:
    #   DATABASE_URL=sqlite:///./nids.db
    #   DATABASE_URL=sqlite+aiosqlite:///./nids.db
    DATABASE_URL: Optional[str] = None

    # ----- MySQL ----------------------------------------------------------------
    MYSQL_HOST: str = "127.0.0.1"
    MYSQL_PORT: int = 3306
    MYSQL_DATABASE: str = "idsdb"
    MYSQL_USER: str = "ids_user"
    MYSQL_PASSWORD: SecretStr = SecretStr("")

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        pwd = self.MYSQL_PASSWORD.get_secret_value() or ""
        return f"mysql+pymysql://{self.MYSQL_USER}:{pwd}@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}?charset=utf8mb4"

    # ----- Auth -----------------------------------------------------------------
    FIRST_ADMIN_USERNAME: str = "analyst"
    FIRST_ADMIN_PASSWORD: SecretStr = SecretStr("")
    JWT_SECRET: SecretStr = SecretStr("")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    # ----- CORS -----------------------------------------------------------------
    CORS_ORIGINS: str = "http://localhost:3000"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, v: Any) -> str:
        if isinstance(v, list):
            return ",".join(v)
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ----- Ingestion ------------------------------------------------------------
    EVE_FILE_PATH: str = "/app/data/empty_eve.json"
    AUTO_REPLAY_SAMPLE_ON_STARTUP: int = 1
    INGESTION_POLL_INTERVAL_SECONDS: float = 1.0
    INGESTION_READ_ERROR_MAX_BACKOFF_SECONDS: float = 30.0
    SAMPLE_EVE_FILE_PATH: str = "/app/data/sample_eve.json"

    # ----- Anomaly --------------------------------------------------------------
    ANOMALY_ENABLED: bool = False
    ANOMALY_SAMPLE_FOR_INITIAL_FIT: int = 500

    # ----- Allowlists / asset labels --------------------------------------------
    ALLOWLIST_CIDRS: str = "127.0.0.1/32,10.0.0.0/8"
    ASSET_LABELS_JSON: str = "{}"
    SEVERITY_MAP_JSON: str = '{"1":"HIGH","2":"MEDIUM","3":"LOW"}'

    @property
    def allowlist_networks(self) -> list[ipaddress._BaseNetwork]:
        out: list[ipaddress._BaseNetwork] = []
        raw = self.ALLOWLIST_CIDRS
        if not raw:
            return out
        for item in raw.split(","):
            item = item.strip()
            if not item:
                continue
            try:
                out.append(ipaddress.ip_network(item, strict=False))
            except ValueError:
                continue
        return out

    @property
    def asset_labels(self) -> dict[str, str]:
        try:
            v = json.loads(self.ASSET_LABELS_JSON)
            return v if isinstance(v, dict) else {}
        except (TypeError, json.JSONDecodeError):
            return {}

    @property
    def severity_map(self) -> dict[str, str]:
        defaults = {"1": "HIGH", "2": "MEDIUM", "3": "LOW",
                    "high": "HIGH", "medium": "MEDIUM", "low": "LOW"}
        try:
            v = json.loads(self.SEVERITY_MAP_JSON)
            if isinstance(v, dict):
                defaults.update({str(k): str(val).upper() for k, val in v.items()})
        except (TypeError, json.JSONDecodeError):
            pass
        return defaults

    # ----- Retention ------------------------------------------------------------
    RETENTION_DAYS: int = 30


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
