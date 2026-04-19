from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any
from ..parsers.graph_to_prompt import build_prompt_from_graph
from ..services.openrouter import stream_openrouter
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


@router.post("/health-score", summary="Compute architecture health score")
async def health_score(req: HealthScoreRequest):
    insights = req.insights

    circular_deps = insights.get("circular_dependencies", [])
    god_classes = [
        s for s in insights.get("architecture_smells", [])
        if s.get("type") == "god_class"
    ]
    orphan_files = insights.get("orphan_files", [])
    hotspots = insights.get("high_complexity_files", [])

    # Score formula: start at 100, deduct per category
    deductions = (
        len(circular_deps) * 5
        + len(god_classes) * 3
        + len(orphan_files) * 2
        + len(hotspots) * 1
    )
    score = max(0, 100 - deductions)

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

    return {
        "score": score,
        "grade": grade,
        "breakdown": {
            "circular_deps": len(circular_deps),
            "god_classes": len(god_classes),
            "orphan_files": len(orphan_files),
            "hotspots": len(hotspots),
        },
    }
