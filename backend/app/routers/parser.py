from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from pathlib import Path
import time
from ..services.architecture_service import architecture_service
from ..services.runtime_tracker import runtime_tracker
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/parser", tags=["parser"])


def _resolve_path_within_project_root(path: str, project_root: Optional[str]) -> Path:
    if not project_root:
        raise ValueError("project_root_required")

    root = Path(project_root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError("invalid_project_root")

    candidate = Path(path)
    resolved = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()

    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PermissionError("path_outside_project_root") from exc

    return resolved


class FileData(BaseModel):
    path: str
    content: str


class ParseRequest(BaseModel):
    files: List[FileData]
    exclude_migrations: bool = True


class FrameworkDetectResponse(BaseModel):
    framework: str
    confidence: float
    runner_up: str | None = None
    scores: Dict[str, int]
    signals: List[str]


@router.post("/analyze-project", summary="Parse Python project and build architecture graph")
async def analyze_project(request: ParseRequest) -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        result = architecture_service.analyze_project(
            files_data,
            exclude_migrations=request.exclude_migrations,
        )
        runtime_tracker.record(
            event_type="analysis",
            command="parser:analyze-project",
            status="success",
            duration_ms=int((time.perf_counter() - started) * 1000),
            source="backend",
            metadata={"files": len(files_data)},
        )
        return result
    except Exception as e:
        runtime_tracker.record(
            event_type="analysis",
            command="parser:analyze-project",
            status="error",
            duration_ms=int((time.perf_counter() - started) * 1000),
            source="backend",
            metadata={"files": len(request.files)},
        )
        logger.error(f"Parser failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Parse failed: {str(e)}")


@router.post("/detect-framework", response_model=FrameworkDetectResponse, summary="Detect project framework")
async def detect_framework(request: ParseRequest) -> FrameworkDetectResponse:
    try:
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        result = architecture_service.detect_framework(files_data)
        return FrameworkDetectResponse(**result)
    except Exception as e:
        logger.error(f"Framework detection failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Framework detection failed: {str(e)}")


@router.post("/parse-file", summary="Parse single Python file")
async def parse_single_file(file: FileData) -> Dict[str, Any]:
    try:
        from ..services.python_parser import PythonParser
        parser = PythonParser()
        result = parser.parse_file(file.path, file.content)
        
        return {
            "path": result.path,
            "file_type": result.file_type,
            "line_count": result.line_count,
            "complexity": result.complexity,
            "classes": [
                {
                    "name": c.name,
                    "bases": c.bases,
                    "methods": c.methods,
                    "decorators": c.decorators,
                    "docstring": c.docstring,
                    "line_number": c.line_number,
                    "role": "model" if c.is_model else "view" if c.is_view else "serializer" if c.is_serializer else "class",
                }
                for c in result.classes
            ],
            "functions": [
                {
                    "name": f.name,
                    "args": f.args,
                    "decorators": f.decorators,
                    "line_number": f.line_number,
                    "is_route": f.is_route,
                    "is_async": f.is_async,
                    "complexity": f.complexity,
                }
                for f in result.functions
            ],
            "imports": [
                {
                    "module": i.module,
                    "names": i.names,
                    "is_relative": i.is_relative,
                }
                for i in result.imports
            ],
        }
    except Exception as e:
        logger.error(f"Single file parse failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file/content", summary="Read file content from disk")
async def get_file_content(
    path: str = Query(..., description="Absolute or relative file path"),
    project_root: Optional[str] = Query(None, description="Project root for resolving relative paths"),
):
    try:
        resolved = _resolve_path_within_project_root(path, project_root)
    except ValueError as e:
        if str(e) == "project_root_required":
            return {
                "error": "project_root_required",
                "message": "project_root is required for secure file reads",
            }
        if str(e) == "invalid_project_root":
            return {
                "error": "invalid_project_root",
                "message": "Project root is invalid or inaccessible",
            }
        return {"error": "invalid_path", "message": f"Cannot resolve path: {path}"}
    except PermissionError:
        return {
            "error": "forbidden_path",
            "message": "Path must be inside the selected project root",
        }

    if not resolved.exists():
        return {"error": "not_found",
                "message": f"File not found: {path}"}

    if not resolved.is_file():
        return {"error": "not_a_file",
                "message": f"Path is not a file: {path}"}

    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            content = resolved.read_text(encoding=encoding)
            return {
                "content": content,
                "encoding": encoding,
                "size": resolved.stat().st_size,
                "lines": content.count("\n") + 1,
            }
        except UnicodeDecodeError:
            continue
        except PermissionError:
            return {"error": "permission_denied",
                    "message": f"Cannot read file (permission denied): {path}"}
        except Exception:
            logger.warning("File read failed", exc_info=True)
            return {"error": "read_error", "message": "Could not read file"}

    return {"error": "encoding_error",
            "message": "Could not decode file with any supported encoding"}
