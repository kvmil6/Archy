"""
Part 5 — Architecture Diff: Snapshot System + Diff Engine.

POST /snapshots/save   — save a named graph snapshot
GET  /snapshots/list   — list saved snapshots
POST /snapshots/diff   — compare two snapshots (or current vs snapshot)
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/snapshots", tags=["snapshots"])

SNAPSHOTS_DIR = Path(".archy_cache") / "snapshots"


# ── Models ───────────────────────────────────────────────────────────

class SaveSnapshotRequest(BaseModel):
    name: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    framework: str = "unknown"
    project_path: str = ""


class DiffRequest(BaseModel):
    """Compare two snapshots by name, or pass 'current' nodes/edges for live diff."""
    snapshot_a: Optional[str] = None
    snapshot_b: Optional[str] = None
    current_nodes: Optional[List[Dict[str, Any]]] = None
    current_edges: Optional[List[Dict[str, Any]]] = None


# ── Helpers ──────────────────────────────────────────────────────────

def _load_snapshot(name: str) -> Dict[str, Any]:
    fp = SNAPSHOTS_DIR / f"{name}.json"
    if not fp.exists():
        raise HTTPException(status_code=404, detail=f"Snapshot not found: {name}")
    return json.loads(fp.read_text(encoding="utf-8"))


def _diff_lists(
    a_items: List[Dict[str, Any]],
    b_items: List[Dict[str, Any]],
    id_key: str = "id",
) -> Dict[str, List]:
    a_map = {item[id_key]: item for item in a_items if id_key in item}
    b_map = {item[id_key]: item for item in b_items if id_key in item}

    added = [b_map[k] for k in b_map if k not in a_map]
    removed = [a_map[k] for k in a_map if k not in b_map]

    changed = []
    for k in a_map:
        if k in b_map:
            if json.dumps(a_map[k], sort_keys=True) != json.dumps(b_map[k], sort_keys=True):
                changed.append({"id": k, "before": a_map[k], "after": b_map[k]})

    return {"added": added, "removed": removed, "changed": changed}


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/save", summary="Save a named graph snapshot")
async def save_snapshot(req: SaveSnapshotRequest):
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in req.name)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid snapshot name")

    data = {
        "name": req.name,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "framework": req.framework,
        "project_path": req.project_path,
        "node_count": len(req.nodes),
        "edge_count": len(req.edges),
        "nodes": req.nodes,
        "edges": req.edges,
    }
    fp = SNAPSHOTS_DIR / f"{safe_name}.json"
    fp.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    return {"success": True, "name": safe_name, "path": str(fp)}


@router.get("/list", summary="List saved snapshots")
async def list_snapshots():
    if not SNAPSHOTS_DIR.exists():
        return {"snapshots": []}

    snapshots = []
    for fp in sorted(SNAPSHOTS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            snapshots.append({
                "name": data.get("name", fp.stem),
                "filename": fp.name,
                "saved_at": data.get("saved_at", ""),
                "framework": data.get("framework", "unknown"),
                "node_count": data.get("node_count", 0),
                "edge_count": data.get("edge_count", 0),
            })
        except Exception:
            continue
    return {"snapshots": snapshots}


@router.post("/diff", summary="Compare two snapshots or current graph vs snapshot")
async def diff_snapshots(req: DiffRequest):
    # Determine A (before) and B (after)
    if req.snapshot_a:
        snap_a = _load_snapshot(req.snapshot_a)
        nodes_a = snap_a.get("nodes", [])
        edges_a = snap_a.get("edges", [])
    else:
        raise HTTPException(status_code=400, detail="snapshot_a is required")

    if req.snapshot_b:
        snap_b = _load_snapshot(req.snapshot_b)
        nodes_b = snap_b.get("nodes", [])
        edges_b = snap_b.get("edges", [])
    elif req.current_nodes is not None and req.current_edges is not None:
        nodes_b = req.current_nodes
        edges_b = req.current_edges
    else:
        raise HTTPException(status_code=400, detail="Provide snapshot_b or current_nodes/current_edges")

    node_diff = _diff_lists(nodes_a, nodes_b, "id")
    edge_diff = _diff_lists(edges_a, edges_b, "id")

    # Build summary
    parts = []
    if node_diff["added"]:
        types = {}
        for n in node_diff["added"]:
            t = n.get("type", "node")
            types[t] = types.get(t, 0) + 1
        for t, c in types.items():
            parts.append(f"+{c} {t}{'s' if c > 1 else ''}")
    if node_diff["removed"]:
        types = {}
        for n in node_diff["removed"]:
            t = n.get("type", "node")
            types[t] = types.get(t, 0) + 1
        for t, c in types.items():
            parts.append(f"-{c} {t}{'s' if c > 1 else ''}")
    if node_diff["changed"]:
        parts.append(f"~{len(node_diff['changed'])} changed")
    if edge_diff["added"]:
        parts.append(f"+{len(edge_diff['added'])} edge{'s' if len(edge_diff['added']) > 1 else ''}")
    if edge_diff["removed"]:
        parts.append(f"-{len(edge_diff['removed'])} edge{'s' if len(edge_diff['removed']) > 1 else ''}")

    summary = "  ".join(parts) if parts else "No changes detected"

    return {
        "added_nodes": node_diff["added"],
        "removed_nodes": node_diff["removed"],
        "changed_nodes": node_diff["changed"],
        "added_edges": edge_diff["added"],
        "removed_edges": edge_diff["removed"],
        "summary": summary,
    }
