from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..services.runtime_tracker import runtime_tracker


router = APIRouter(prefix="/runtime", tags=["runtime"])


class RuntimeEventRequest(BaseModel):
    event_type: str
    command: str
    status: str
    duration_ms: Optional[int] = None
    source: str = "frontend"
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.post("/events", summary="Record runtime activity event")
async def record_runtime_event(body: RuntimeEventRequest) -> Dict[str, Any]:
    event = runtime_tracker.record(
        event_type=body.event_type,
        command=body.command,
        status=body.status,
        duration_ms=body.duration_ms,
        source=body.source,
        metadata=body.metadata,
    )
    return {
        "ok": True,
        "event": event.__dict__,
    }


@router.get("/events", summary="Recent runtime events")
async def get_runtime_events(limit: int = Query(default=100, le=500)) -> List[Dict[str, Any]]:
    summary = runtime_tracker.summary()
    events: list = summary.get("recent_events", [])
    return events[-limit:]


@router.get("/summary", summary="Runtime activity summary")
async def runtime_summary() -> Dict[str, Any]:
    return runtime_tracker.summary()
