"""
Part 8 — Graph-Aware Security Scanner API.

POST /security/scan — run all OWASP-informed rules on the graph
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.security_scanner import scan_graph

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/security", tags=["security"])


class SecurityScanRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    file_contents: Optional[Dict[str, str]] = None


@router.post("/scan", summary="Run graph-aware security scan")
async def run_security_scan(req: SecurityScanRequest):
    issues = scan_graph(req.nodes, req.edges, req.file_contents)

    by_severity = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0}
    for issue in issues:
        sev = issue.get("severity", "MEDIUM")
        by_severity[sev] = by_severity.get(sev, 0) + 1

    return {
        "total": len(issues),
        "by_severity": by_severity,
        "issues": issues,
    }
