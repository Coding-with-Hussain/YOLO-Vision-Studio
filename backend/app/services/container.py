"""Construction of the long-lived service objects shared by all requests."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.core.config import Settings
from app.services.database import Database
from app.services.devices import DeviceManager
from app.services.history import HistoryService
from app.services.inference import InferenceService
from app.services.model_registry import ModelRegistry
from app.services.runtime_settings import RuntimeSettingsStore
from app.services.storage import StorageService
from app.services.video_jobs import VideoJobManager


@dataclass
class Services:
    settings: Settings
    db: Database
    runtime: RuntimeSettingsStore
    storage: StorageService
    devices: DeviceManager
    registry: ModelRegistry
    inference: InferenceService
    history: HistoryService
    jobs: VideoJobManager
    started_at: float = field(default_factory=time.time)
    live_sessions: int = 0


def build_services(settings: Settings) -> Services:
    settings.ensure_directories()
    db = Database(settings.database_path)
    runtime = RuntimeSettingsStore(settings.runtime_settings_path)
    storage = StorageService(settings, db, runtime)
    devices = DeviceManager(allow_cuda=settings.allow_cuda)
    registry = ModelRegistry(db, settings, devices)
    inference = InferenceService(devices)
    history = HistoryService(db, storage)
    jobs = VideoJobManager(settings, registry, inference, history, storage, runtime)
    return Services(
        settings=settings,
        db=db,
        runtime=runtime,
        storage=storage,
        devices=devices,
        registry=registry,
        inference=inference,
        history=history,
        jobs=jobs,
    )
