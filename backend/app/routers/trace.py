"""
Part 7 — Runtime Tracing Overlay API.

POST /trace/start   — enable tracing
POST /trace/stop    — disable + return summary
GET  /trace/current — return current trace data
POST /trace/import  — import OTel JSON trace
"""
import logging
from typing import Any, List

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.tracer import tracer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trace", tags=["trace"])


class TraceStartRequest(BaseModel):
    project_dir: str


class OTelImportRequest(BaseModel):
    spans: List[dict[str, Any]]


@router.post("/start", summary="Enable runtime tracing")
async def start_trace(req: TraceStartRequest):
    return tracer.start(req.project_dir)


@router.post("/stop", summary="Disable tracing and return summary")
async def stop_trace():
    return tracer.stop()


@router.get("/current", summary="Return current trace data")
async def current_trace():
    return tracer.get_current()


@router.post("/import", summary="Import OpenTelemetry trace spans")
async def import_otel(req: OTelImportRequest):
    return tracer.import_otel(req.spans)
