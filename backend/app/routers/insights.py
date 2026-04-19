"""
Smart Architecture Insights — AI-powered project health analysis.

POST /insights/scan
  Accepts graph nodes + edges + metrics, returns a streaming SSE report
  that flags structural problems and suggests concrete improvements.
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any
import json

from ..services.openrouter import stream_openrouter

router = APIRouter(prefix="/insights", tags=["insights"])


class InsightRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    metrics: dict[str, Any] | None = None
    framework: str = "unknown"
    model: str | None = None


def _build_insight_prompt(req: InsightRequest) -> list[dict[str, str]]:
    node_types: dict[str, int] = {}
    for n in req.nodes:
        t = n.get("type", "unknown")
        node_types[t] = node_types.get(t, 0) + 1

    edge_count = len(req.edges)
    node_count = len(req.nodes)

    # Identify high-degree nodes (potential god classes)
    in_degree: dict[str, int] = {}
    out_degree: dict[str, int] = {}
    for e in req.edges:
        src = e.get("source", "")
        tgt = e.get("target", "")
        out_degree[src] = out_degree.get(src, 0) + 1
        in_degree[tgt] = in_degree.get(tgt, 0) + 1

    node_labels: dict[str, str] = {}
    for n in req.nodes:
        node_labels[n.get("id", "")] = n.get("data", {}).get("label", n.get("id", ""))

    god_candidates = [
        f"{node_labels.get(nid, nid)} (in={in_degree.get(nid, 0)}, out={out_degree.get(nid, 0)})"
        for nid in set(list(in_degree.keys()) + list(out_degree.keys()))
        if in_degree.get(nid, 0) + out_degree.get(nid, 0) >= 6
    ]

    # Build readable graph summary
    summary_lines = [
        f"Framework: {req.framework}",
        f"Total nodes: {node_count}",
        f"Total edges: {edge_count}",
        f"Node types: {json.dumps(node_types)}",
    ]

    if req.metrics:
        m = req.metrics
        summary_lines += [
            f"Total classes: {m.get('total_classes', 'N/A')}",
            f"Total routes: {m.get('total_routes', 'N/A')}",
            f"Average complexity: {m.get('average_complexity', 'N/A')}",
            f"Max complexity: {m.get('max_complexity', 'N/A')}",
            f"Orphan modules: {m.get('orphan_count', 0)}",
            f"Circular deps: {m.get('circular_count', 0)}",
            f"God class candidates: {m.get('god_class_count', 0)}",
        ]

    if god_candidates:
        summary_lines.append(f"High-connectivity nodes: {', '.join(god_candidates[:8])}")

    summary = "\n".join(summary_lines)

    system_prompt = (
        "You are Archy's Architecture Doctor — an expert software architect who reviews "
        "Python backend project graphs and produces concise, actionable recommendations.\n\n"
        "Your analysis must:\n"
        "1. Open with a one-sentence overall verdict (Good / Needs Work / Critical Issues).\n"
        "2. List up to 5 concrete, prioritised findings in markdown bullet format.\n"
        "   Each finding must have: a short title (bold), one sentence explaining the problem, "
        "   and one sentence with a specific code-level fix.\n"
        "3. Close with a 'Health Score' line: ## Health Score: X/100 (with one word rating).\n\n"
        "Be specific and technical. Reference actual node names when available. "
        "Do NOT pad with generic advice. If the architecture looks healthy, say so clearly "
        "and give improvement ideas for scale/maintainability instead."
    )

    user_prompt = (
        f"Analyse this Python backend architecture and give your Architecture Doctor report:\n\n"
        f"{summary}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


@router.post("/scan", summary="AI architecture health scan")
async def scan_architecture(req: InsightRequest) -> StreamingResponse:
    messages = _build_insight_prompt(req)
    return StreamingResponse(
        stream_openrouter(messages, model=req.model or None),
        media_type="text/event-stream",
    )
