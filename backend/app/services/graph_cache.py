"""
Graph cache — writes parsed graph data to .archy_cache/graph.json
so the MCP server can read it even when the Archy UI is closed.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(".archy_cache")
GRAPH_FILE = CACHE_DIR / "graph.json"


def write_graph_cache(
    project_path: str,
    framework: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    insights: dict[str, Any] | None = None,
    health_score: int | None = None,
) -> None:
    """Write graph data to .archy_cache/graph.json (atomic write)."""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data = {
            "project_path": project_path,
            "framework": framework,
            "parsed_at": datetime.now(timezone.utc).isoformat(),
            "nodes": nodes,
            "edges": edges,
            "insights": insights or {},
            "health_score": health_score or 100,
        }
        tmp = GRAPH_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        tmp.replace(GRAPH_FILE)
        logger.info("Graph cache written: %d nodes, %d edges", len(nodes), len(edges))
    except Exception:
        logger.warning("Failed to write graph cache", exc_info=True)


def read_graph_cache() -> dict[str, Any] | None:
    """Read the cached graph. Returns None if not available."""
    try:
        if not GRAPH_FILE.exists():
            return None
        return json.loads(GRAPH_FILE.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Failed to read graph cache", exc_info=True)
        return None
