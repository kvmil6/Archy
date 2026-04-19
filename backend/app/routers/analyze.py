from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any
from ..parsers.graph_to_prompt import build_prompt_from_graph
from ..services.openrouter import stream_openrouter
from ..services.blast_radius import compute_blast_radius
from ..schemas.graph import GraphSchema
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analyze", tags=["analysis"])

@router.post("", summary="Analyze current backend diagram structure")
async def analyze_graph(graph_data: GraphSchema):
    try:
        payload = graph_data.model_dump()
        prompt = build_prompt_from_graph(payload)
        return StreamingResponse(
            stream_openrouter(prompt),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"Analysis Failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal structure parsing failure.")


class HealthScoreRequest(BaseModel):
    insights: dict[str, Any]
    metrics: dict[str, Any] | None = None


def _compute_health(insights: dict[str, Any], metrics: dict[str, Any] | None = None):
    """
    Health score algorithm — start at 100, floor at 0.
    -5 per circular dependency pair
    -3 per god class (class with >20 methods)
    -2 per orphan file (not imported anywhere)
    -1 per complexity hotspot (cyclomatic complexity > 10)
    -2 per cluttered models.py (>10 models in one file)
    """
    circular_deps = insights.get("circular_dependencies", [])
    god_classes = [
        s for s in insights.get("architecture_smells", [])
        if s.get("type") == "god_class"
    ]
    orphan_files = insights.get("orphan_files", [])
    hotspots = insights.get("high_complexity_files", [])
    cluttered_models = [
        s for s in insights.get("architecture_smells", [])
        if s.get("type") == "cluttered_models"
    ]

    penalties: list[dict[str, Any]] = []

    for dep in circular_deps:
        penalties.append({
            "category": "circular_dependency",
            "cost": 5,
            "file": dep.get("file", dep.get("from", "?")),
            "detail": f"Circular dependency: {dep.get('from', '?')} ↔ {dep.get('to', '?')}",
            "fix": "Break the cycle by introducing an interface or moving shared code to a separate module.",
        })

    for gc in god_classes:
        penalties.append({
            "category": "god_class",
            "cost": 3,
            "file": gc.get("file", "?"),
            "detail": f"God class: {gc.get('name', gc.get('file', '?'))} ({gc.get('methods', '?')} methods)",
            "fix": "Split into smaller, single-responsibility classes.",
        })

    for orph in orphan_files:
        f = orph if isinstance(orph, str) else orph.get("file", "?")
        penalties.append({
            "category": "orphan_file",
            "cost": 2,
            "file": f,
            "detail": f"Orphan file (not imported anywhere): {f}",
            "fix": "Import it from another module or remove if unused.",
        })

    for hot in hotspots:
        f = hot if isinstance(hot, str) else hot.get("file", "?")
        c = hot.get("complexity", "?") if isinstance(hot, dict) else "?"
        penalties.append({
            "category": "complexity_hotspot",
            "cost": 1,
            "file": f if isinstance(f, str) else "?",
            "detail": f"Complexity hotspot (score {c}): {f}",
            "fix": "Refactor complex functions into smaller, testable units.",
        })

    for cm in cluttered_models:
        penalties.append({
            "category": "cluttered_models",
            "cost": 2,
            "file": cm.get("file", "?"),
            "detail": f"Cluttered models file: {cm.get('file', '?')} ({cm.get('count', '?')} models)",
            "fix": "Split into separate files, one model per file or logical grouping.",
        })

    total_penalty = sum(p["cost"] for p in penalties)
    score = max(0, 100 - total_penalty)

    if score >= 90:
        grade = "A"
    elif score >= 80:
        grade = "B"
    elif score >= 70:
        grade = "C"
    elif score >= 60:
        grade = "D"
    else:
        grade = "F"

    breakdown = {
        "circular_deps": len(circular_deps),
        "god_classes": len(god_classes),
        "orphan_files": len(orphan_files),
        "hotspots": len(hotspots),
        "cluttered_models": len(cluttered_models),
    }

    return {
        "score": score,
        "grade": grade,
        "breakdown": breakdown,
        "penalties": penalties,
    }


@router.post("/health-score", summary="Compute architecture health score (POST)")
async def health_score(req: HealthScoreRequest):
    return _compute_health(req.insights, req.metrics)


@router.get("/health-score", summary="Compute architecture health score (GET — accepts query)")
async def health_score_get():
    """Placeholder GET — frontends should use POST with insights data."""
    return {
        "score": 100,
        "grade": "A",
        "breakdown": {"circular_deps": 0, "god_classes": 0, "orphan_files": 0, "hotspots": 0, "cluttered_models": 0},
        "penalties": [],
    }


class BlastRadiusRequest(BaseModel):
    node_id: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    max_depth: int = 6


@router.post("/blast-radius", summary="Compute blast radius for a node")
async def blast_radius(req: BlastRadiusRequest):
    return compute_blast_radius(req.node_id, req.nodes, req.edges, req.max_depth)
