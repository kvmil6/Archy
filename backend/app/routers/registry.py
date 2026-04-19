from __future__ import annotations

from fastapi import FastAPI

from . import (
    advanced,
    ai,
    analyze,
    brain,
    config,
    database,
    editor,
    file_insight,
    generate,
    git_info,
    insights,
    models,
    parser,
    projects,
    runtime,
    security,
    snapshots,
    status,
    trace,
)


ROUTERS = [
    ai.router,
    analyze.router,
    generate.router,
    brain.router,
    editor.router,
    projects.router,
    status.router,
    config.router,
    parser.router,
    file_insight.router,
    database.router,
    advanced.router,
    git_info.router,
    runtime.router,
    models.router,
    insights.router,
    snapshots.router,
    trace.router,
    security.router,
]


def register_routers(app: FastAPI) -> None:
    for router in ROUTERS:
        app.include_router(router)
