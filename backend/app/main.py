"""FastAPI application entry point.

Run with ``uvicorn app.main:app --reload`` from the ``backend`` directory.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.api.routes import health, history, inference, jobs, live, models, settings as settings_routes
from app.core.config import APP_NAME, APP_VERSION, Settings, get_settings
from app.core.errors import register_exception_handlers
from app.services.container import Services, build_services

logger = logging.getLogger("yolo_vision_studio")


async def _cleanup_loop(services: Services) -> None:
    while True:
        try:
            await run_in_threadpool(services.storage.cleanup, services.jobs.active_ids())
        except Exception:  # noqa: BLE001
            logger.exception("Scheduled cleanup failed")
        await asyncio.sleep(services.runtime.get().cleanup_interval_minutes * 60)


def create_app(settings: Settings | None = None, *, start_background_tasks: bool = True) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        services = build_services(settings)
        app.state.services = services
        services.history.mark_interrupted()
        if settings.autoload_last_model:
            await run_in_threadpool(services.registry.autoload)
        cleanup_task = asyncio.create_task(_cleanup_loop(services)) if start_background_tasks else None
        logger.info("%s %s ready (device: %s)", APP_NAME, APP_VERSION, services.devices.default_device())
        try:
            yield
        finally:
            if cleanup_task is not None:
                cleanup_task.cancel()
                with suppress(asyncio.CancelledError):
                    await cleanup_task
            await run_in_threadpool(services.jobs.shutdown)
            services.db.close()

    app = FastAPI(
        title=f"{APP_NAME} API",
        version=APP_VERSION,
        description="Object detection with custom Ultralytics YOLO checkpoints.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "Content-Length", "Content-Range", "Accept-Ranges"],
    )
    register_exception_handlers(app)

    for router in (
        health.router,
        models.router,
        inference.router,
        jobs.router,
        history.router,
        settings_routes.router,
        live.router,
    ):
        app.include_router(router, prefix="/api")

    if settings.frontend_dist_dir:
        _mount_frontend(app, settings.frontend_dist_dir)
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve a built frontend from the same origin (optional production setup)."""
    index = dist / "index.html"
    if not index.is_file():
        logger.warning("YVS_FRONTEND_DIST_DIR is set but %s has no index.html", dist)
        return
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()
