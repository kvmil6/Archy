"""
Feature 1 — Blast Radius Analysis.

Given a node, compute all nodes that would be affected if it changes.
Uses weighted BFS over the dependency graph to produce concentric
impact rings: direct (ring 1), transitive (ring 2+).
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def compute_blast_radius(
    target_node_id: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    max_depth: int = 6,
) -> dict[str, Any]:
    """
    BFS from target_node_id along reverse edges (who depends on me).
    Returns rings of impacted nodes and summary stats.
    """
    # Build adjacency: source → [targets] (who I depend on)
    # Reverse: target → [sources] (who depends on me)
    dependents: dict[str, list[str]] = {}
    for e in edges:
        src = e.get("source", "")
        tgt = e.get("target", "")
        if src and tgt:
            dependents.setdefault(tgt, []).append(src)

    node_map = {n.get("id", ""): n for n in nodes}

    if target_node_id not in node_map:
        return {"error": f"Node {target_node_id} not found", "rings": [], "total_affected": 0}

    # BFS
    visited: dict[str, int] = {target_node_id: 0}
    queue: list[tuple[str, int]] = [(target_node_id, 0)]
    rings: dict[int, list[dict]] = {}

    while queue:
        current, depth = queue.pop(0)
        if depth >= max_depth:
            continue
        for dep in dependents.get(current, []):
            if dep not in visited:
                visited[dep] = depth + 1
                queue.append((dep, depth + 1))
                ring_num = depth + 1
                if ring_num not in rings:
                    rings[ring_num] = []
                node_info = node_map.get(dep, {})
                rings[ring_num].append({
                    "id": dep,
                    "label": node_info.get("data", {}).get("label", dep),
                    "type": node_info.get("type", "unknown"),
                    "filepath": node_info.get("data", {}).get("filepath", ""),
                    "ring": ring_num,
                })

    # Build ordered ring list
    ring_list = []
    for ring_num in sorted(rings.keys()):
        ring_list.append({
            "ring": ring_num,
            "severity": "direct" if ring_num == 1 else "transitive" if ring_num <= 3 else "indirect",
            "nodes": rings[ring_num],
        })

    total = sum(len(r["nodes"]) for r in ring_list)
    target_info = node_map[target_node_id]

    return {
        "target": {
            "id": target_node_id,
            "label": target_info.get("data", {}).get("label", target_node_id),
            "type": target_info.get("type", "unknown"),
        },
        "rings": ring_list,
        "total_affected": total,
        "max_depth_reached": max_depth,
        "severity_summary": {
            "direct": sum(len(r["nodes"]) for r in ring_list if r["severity"] == "direct"),
            "transitive": sum(len(r["nodes"]) for r in ring_list if r["severity"] == "transitive"),
            "indirect": sum(len(r["nodes"]) for r in ring_list if r["severity"] == "indirect"),
        },
    }
