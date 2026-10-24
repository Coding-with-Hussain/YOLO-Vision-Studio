"""Static server configuration loaded from environment variables.

Every option can be set with a ``YVS_`` prefixed environment variable or in
``backend/.env``. These values are fixed for the lifetime of the process.
User-adjustable defaults (thresholds, retention, ...) live in
``app.services.runtime_settings`` instead.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]

APP_NAME = "YOLO Vision Studio"
APP_VERSION = "1.0.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="YVS_",
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Storage
    storage_dir: Path = Field(default=BACKEND_ROOT / "storage")

    # CORS: comma separated list of allowed origins.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"

    # Upload limits (megabytes)
    max_model_size_mb: int = Field(default=512, ge=1, le=8192)
    max_image_size_mb: int = Field(default=25, ge=1, le=512)
    max_video_size_mb: int = Field(default=1024, ge=1, le=16384)
    max_image_pixels: int = Field(default=60_000_000, ge=1_000_000)

    # Model handling
    # Inspect the pickle inside uploaded checkpoints and refuse unexpected
    # imports before handing the file to torch.load. Only disable this for
    # checkpoints you fully trust.
    model_security_scan: bool = True
    # Maximum number of models kept in memory at the same time.
    max_loaded_models: int = Field(default=2, ge=1, le=16)
    # Load the previously active model automatically on startup.
    autoload_last_model: bool = True
    # Allow CUDA when available. Set to false to force CPU everywhere.
    allow_cuda: bool = True

    # Inference
    inference_timeout_s: float = Field(default=120.0, gt=0)
    max_concurrent_video_jobs: int = Field(default=1, ge=1, le=8)
    video_job_timeout_s: float = Field(default=6 * 3600, gt=0)
    live_max_frame_bytes: int = Field(default=4 * 1024 * 1024, ge=64 * 1024)

    # Optional: serve a built frontend (frontend/dist) from the API origin.
    frontend_dist_dir: Path | None = None

    # Logging
    log_level: str = "INFO"

    @field_validator("log_level")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def weights_dir(self) -> Path:
        return self.storage_dir / "weights"

    @property
    def uploads_dir(self) -> Path:
        return self.storage_dir / "uploads"

    @property
    def outputs_dir(self) -> Path:
        return self.storage_dir / "outputs"

    @property
    def database_path(self) -> Path:
        return self.storage_dir / "yvs.sqlite3"

    @property
    def runtime_settings_path(self) -> Path:
        return self.storage_dir / "settings.json"

    def ensure_directories(self) -> None:
        for directory in (self.storage_dir, self.weights_dir, self.uploads_dir, self.outputs_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
