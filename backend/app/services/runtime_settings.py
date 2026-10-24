"""User-adjustable defaults persisted as JSON in the storage directory."""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

from pydantic import ValidationError

from app.schemas.settings import RuntimeSettings, RuntimeSettingsUpdate

logger = logging.getLogger(__name__)


class RuntimeSettingsStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._settings = self._read()

    def _read(self) -> RuntimeSettings:
        if not self.path.exists():
            return RuntimeSettings()
        try:
            data = json.loads(self.path.read_text("utf-8"))
            # Ignore unknown keys from older versions instead of failing startup.
            known = {k: v for k, v in data.items() if k in RuntimeSettings.model_fields}
            return RuntimeSettings(**known)
        except (OSError, ValueError, ValidationError) as exc:
            logger.warning("Ignoring invalid settings file %s: %s", self.path.name, exc)
            return RuntimeSettings()

    def get(self) -> RuntimeSettings:
        with self._lock:
            return self._settings.model_copy()

    def update(self, update: RuntimeSettingsUpdate) -> RuntimeSettings:
        with self._lock:
            merged = self._settings.model_dump() | update.model_dump(exclude_none=True)
            self._settings = RuntimeSettings(**merged)
            self._write()
            return self._settings.model_copy()

    def reset(self) -> RuntimeSettings:
        with self._lock:
            self._settings = RuntimeSettings()
            self._write()
            return self._settings.model_copy()

    def _write(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._settings.model_dump(), indent=2), "utf-8")
        tmp.replace(self.path)
