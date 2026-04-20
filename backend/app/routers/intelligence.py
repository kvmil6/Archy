"""
Intelligence router — endpoints for advanced features:
  - /intel/dead-code        (Feature 2)
  - /intel/contracts        (Feature 7)
  - /intel/adr              (Feature 8)
  - /intel/nl-query         (Feature 10)
"""
import logging
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.dead_code import detect_dead_code
from ..services.contract_validator import validate_contracts
from ..services.adr_generator import generate_adr

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intel", tags=["intelligence"])


# ── Feature 2: Dead Code ─────────────────────────────────────────────

class DeadCodeRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    trace_data: Optional[dict[str, Any]] = None


@router.post("/dead-code", summary="Detect dead/unreachable code via graph analysis")
async def dead_code(req: DeadCodeRequest):
    return detect_dead_code(req.nodes, req.edges, req.trace_data)


# ── Feature 7: Contract Validation ───────────────────────────────────

class ContractRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    file_contents: Optional[dict[str, str]] = None


@router.post("/contracts", summary="Validate API contracts against implementation")
async def contracts(req: ContractRequest):
    return validate_contracts(req.nodes, req.edges, req.file_contents)


# ── Feature 8: ADR Generation ────────────────────────────────────────

class ADRRequest(BaseModel):
    diff_data: dict[str, Any]
    project_name: str = "Project"
    health_before: Optional[int] = None
    health_after: Optional[int] = None


@router.post("/adr", summary="Generate Architecture Decision Record from diff")
async def adr(req: ADRRequest):
    return generate_adr(req.diff_data, req.project_name, req.health_before, req.health_after)


# ── Feature 10: Natural Language Graph Query ─────────────────────────

class NLQueryRequest(BaseModel):
    query: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


@router.post("/nl-query", summary="Natural language query over the architecture graph")
async def nl_query(req: NLQueryRequest):
    """
    Translate a natural language query into graph operations.
    Returns matching node IDs and an explanation.
    """
    q = req.query.lower().strip()
    node_map = {n.get("id", ""): n for n in req.nodes}
    matched_ids: list[str] = []
    explanation = ""

    # Build adjacency
    deps_of: dict[str, list[str]] = {}  # source depends on targets
    depended_by: dict[str, list[str]] = {}  # target is depended on by sources
    for e in req.edges:
        s, t = e.get("source", ""), e.get("target", "")
        deps_of.setdefault(s, []).append(t)
        depended_by.setdefault(t, []).append(s)

    # Pattern matching for common queries
    if _matches(q, ["unused", "dead", "orphan", "unreachable", "not imported"]):
        for n in req.nodes:
            nid = n.get("id", "")
            if nid not in depended_by or len(depended_by[nid]) == 0:
                ntype = n.get("type", n.get("data", {}).get("type", ""))
                if ntype not in ("app", "entryInterface", "route", "config"):
                    matched_ids.append(nid)
        explanation = f"Found {len(matched_ids)} nodes with no incoming edges (potentially unused)"

    elif _matches(q, ["circular", "cycle", "cyclic"]):
        visited = set()
        in_cycle = set()
        for nid in node_map:
            _find_cycles(nid, deps_of, set(), visited, in_cycle)
        matched_ids = list(in_cycle)
        explanation = f"Found {len(matched_ids)} nodes involved in circular dependencies"

    elif _matches(q, ["most connected", "most dependencies", "hub", "central"]):
        scored = []
        for n in req.nodes:
            nid = n.get("id", "")
            total = len(deps_of.get(nid, [])) + len(depended_by.get(nid, []))
            scored.append((nid, total))
        scored.sort(key=lambda x: -x[1])
        matched_ids = [s[0] for s in scored[:10]]
        explanation = f"Top {len(matched_ids)} most-connected nodes (hubs)"

    elif _matches(q, ["model", "database", "orm", "schema"]):
        for n in req.nodes:
            ntype = n.get("type", n.get("data", {}).get("type", ""))
            label = n.get("data", {}).get("label", "").lower()
            if ntype == "model" or "model" in label:
                matched_ids.append(n.get("id", ""))
        explanation = f"Found {len(matched_ids)} model/database nodes"

    elif _matches(q, ["route", "endpoint", "url", "api"]):
        for n in req.nodes:
            ntype = n.get("type", n.get("data", {}).get("type", ""))
            label = n.get("data", {}).get("label", "").lower()
            if ntype in ("route", "entryInterface") or "url" in label or "route" in label:
                matched_ids.append(n.get("id", ""))
        explanation = f"Found {len(matched_ids)} route/endpoint nodes"

    elif _matches(q, ["view", "controller", "handler"]):
        for n in req.nodes:
            ntype = n.get("type", n.get("data", {}).get("type", ""))
            label = n.get("data", {}).get("label", "").lower()
            if ntype == "controller" or "view" in label:
                matched_ids.append(n.get("id", ""))
        explanation = f"Found {len(matched_ids)} view/controller nodes"

    elif _matches(q, ["connect", "depend", "import", "use", "touch"]):
        # "nodes that touch X" or "nodes that depend on X"
        target_name = _extract_target(q)
        if target_name:
            target_ids = [
                n.get("id", "") for n in req.nodes
                if target_name in n.get("data", {}).get("label", "").lower()
            ]
            for tid in target_ids:
                matched_ids.append(tid)
                matched_ids.extend(depended_by.get(tid, []))
                matched_ids.extend(deps_of.get(tid, []))
            matched_ids = list(set(matched_ids))
            explanation = f"Found {len(matched_ids)} nodes connected to '{target_name}'"
        else:
            explanation = "Could not determine the target. Try: 'nodes that depend on UserModel'"

    elif _matches(q, ["complex", "complicated", "hotspot", "big", "large"]):
        scored = []
        for n in req.nodes:
            data = n.get("data", {})
            cx = data.get("complexity", data.get("complexity_score", 0))
            lc = data.get("line_count", 0)
            score = (cx or 0) * 2 + (lc or 0) / 10
            if score > 5:
                scored.append((n.get("id", ""), score))
        scored.sort(key=lambda x: -x[1])
        matched_ids = [s[0] for s in scored[:15]]
        explanation = f"Found {len(matched_ids)} high-complexity / large nodes"

    else:
        # Fallback: text search in labels
        for n in req.nodes:
            label = n.get("data", {}).get("label", "").lower()
            filepath = n.get("data", {}).get("filepath", "").lower()
            if any(word in label or word in filepath for word in q.split()):
                matched_ids.append(n.get("id", ""))
        explanation = f"Text search matched {len(matched_ids)} nodes for '{req.query}'"

    return {
        "query": req.query,
        "matched_node_ids": matched_ids,
        "count": len(matched_ids),
        "explanation": explanation,
    }


def _matches(q: str, keywords: list[str]) -> bool:
    return any(kw in q for kw in keywords)


def _extract_target(q: str) -> str | None:
    """Try to extract a noun target from the query."""
    import re
    # "depend on X", "touch X", "connect to X", "import X"
    m = re.search(r"(?:depend on|touch|connect to|import|use)\s+['\"]?(\w+)", q)
    if m:
        return m.group(1).lower()
    # Last word as fallback
    words = q.split()
    if len(words) >= 2:
        return words[-1]
    return None


def _find_cycles(
    node: str,
    adj: dict[str, list[str]],
    path: set[str],
    visited: set[str],
    in_cycle: set[str],
):
    if node in path:
        in_cycle.update(path)
        return
    if node in visited:
        return
    visited.add(node)
    path.add(node)
    for neighbor in adj.get(node, []):
        _find_cycles(neighbor, adj, path, visited, in_cycle)
    path.discard(node)
