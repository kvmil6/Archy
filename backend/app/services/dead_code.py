"""
Feature 2 — Dead Code Graveyard.

Identifies provably unreachable code by analyzing the dependency graph:
- Functions/classes never imported or called
- Modules never referenced by any other module
- Routes registered but pointing to missing views
Combines static graph analysis with optional runtime trace data for confidence scoring.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def detect_dead_code(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    trace_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Walk the graph and find nodes with zero incoming edges (never imported/called).
    Cross-reference with trace data if available for confidence scoring.
    """
    node_map = {n.get("id", ""): n for n in nodes}
    # Track incoming edges per node
    incoming: dict[str, int] = {n.get("id", ""): 0 for n in nodes}
    for e in edges:
        tgt = e.get("target", "")
        if tgt in incoming:
            incoming[tgt] = incoming.get(tgt, 0) + 1

    # Entry points — nodes that are expected to have no importers
    ENTRY_TYPES = {"app", "entryInterface", "route", "config", "settings", "migration"}
    ENTRY_LABELS = {"manage.py", "wsgi.py", "asgi.py", "conftest.py", "__init__.py", "setup.py", "urls.py"}

    dead_nodes: list[dict[str, Any]] = []
    for nid, count in incoming.items():
        node = node_map.get(nid, {})
        data = node.get("data", {})
        label = data.get("label", "")
        ntype = node.get("type", data.get("type", ""))
        filepath = data.get("filepath", "")

        # Skip entry points — they're not dead
        if ntype in ENTRY_TYPES:
            continue
        if any(label.endswith(e) for e in ENTRY_LABELS):
            continue
        # Skip __init__ files
        if "__init__" in filepath or "__init__" in label:
            continue

        if count == 0:
            # No one imports/calls this node
            # Check outgoing edges (does it import others?)
            outgoing = sum(1 for e in edges if e.get("source") == nid)

            # Confidence scoring
            confidence = 0.85  # base confidence for static-only
            reason = "No incoming edges — never imported or referenced"

            if trace_data:
                trace_calls = trace_data.get("calls", {})
                if filepath in trace_calls and trace_calls[filepath].get("count", 0) > 0:
                    # Runtime saw this file — not dead
                    continue
                else:
                    confidence = 0.95  # confirmed by runtime
                    reason += " + not seen in runtime trace"

            dead_nodes.append({
                "id": nid,
                "label": label,
                "type": ntype,
                "filepath": filepath,
                "confidence": confidence,
                "reason": reason,
                "outgoing_deps": outgoing,
                "line_count": data.get("line_count", 0),
            })

    # Sort by confidence desc, then by line_count desc (bigger files = more impact)
    dead_nodes.sort(key=lambda x: (-x["confidence"], -x.get("line_count", 0)))

    total_lines = sum(n.get("line_count", 0) for n in dead_nodes)

    return {
        "dead_nodes": dead_nodes,
        "total_dead": len(dead_nodes),
        "total_nodes": len(nodes),
        "dead_percentage": round(len(dead_nodes) / max(len(nodes), 1) * 100, 1),
        "estimated_dead_lines": total_lines,
        "has_runtime_data": trace_data is not None,
    }
