from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import logging

from ..services.db_inspector import SQLiteInspector, build_db_graph_fragment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/database", tags=["database"])


class InspectRequest(BaseModel):
    db_path: str
    include_row_counts: bool = True
    existing_class_labels: Optional[List[str]] = None


class DetectRequest(BaseModel):
    project_path: str


@router.post("/inspect", summary="Inspect a SQLite database file and return graph fragment")
async def inspect_database(body: InspectRequest) -> Dict[str, Any]:
    path = body.db_path
    if not path:
        raise HTTPException(status_code=400, detail="db_path is required")
    if not os.path.isabs(path):
        raise HTTPException(
            status_code=400,
            detail="db_path must be an absolute path",
        )
    if not any(path.lower().endswith(ext) for ext in ('.sqlite', '.sqlite3', '.db')):
        raise HTTPException(
            status_code=400,
            detail="Only .sqlite, .sqlite3, and .db files are supported (SQLite only).",
        )
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    try:
        inspector = SQLiteInspector(path)
        inspection = inspector.inspect(include_row_counts=body.include_row_counts)
    except (FileNotFoundError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("DB inspection failed")
        raise HTTPException(status_code=500, detail=f"Inspection failed: {e}")

    fragment = build_db_graph_fragment(
        inspection,
        existing_class_labels=body.existing_class_labels,
    )
    fragment['inspection'] = inspection
    return fragment


@router.post("/detect", summary="Auto-detect SQLite databases in a project directory")
async def detect_databases(body: DetectRequest) -> Dict[str, Any]:
    project_path = body.project_path
    if not project_path or not os.path.isabs(project_path):
        raise HTTPException(
            status_code=400,
            detail="project_path must be an absolute path",
        )
    if not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Directory not found")

    ignore_dirs = {
        'node_modules', '__pycache__', '.git', 'venv', '.venv',
        'dist', 'build', '.tox', '.mypy_cache', '.pytest_cache',
    }

    candidates: List[Dict[str, Any]] = []
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for name in files:
            lower = name.lower()
            if any(lower.endswith(ext) for ext in ('.sqlite', '.sqlite3', '.db')):
                full = os.path.join(root, name)
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                rank = 0
                if lower in ('db.sqlite3', 'db.sqlite'):
                    rank = 1000
                elif 'django' in lower or 'app' in lower:
                    rank = 500
                rank += min(size // 1024, 500)
                candidates.append({
                    'path': full,
                    'name': name,
                    'size_bytes': size,
                    'rank': rank,
                })

    candidates.sort(key=lambda c: -c['rank'])
    return {'count': len(candidates), 'candidates': candidates[:20]}
