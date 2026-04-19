import subprocess
import platform
import os
import sys
import time
import threading
import shutil
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from ..services.runtime_tracker import runtime_tracker

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/editor", tags=["editor"])

_DEDUP_WINDOW_SECONDS = 1.25
_dedup_lock = threading.Lock()
_last_open_request: dict[str, object] = {"key": None, "at": 0.0}
_SAFE_PATH_CHARS = re.compile(r"^[A-Za-z0-9_./\\:\- ]+$")
_ALLOWED_EDITORS = {
    "cursor": "Cursor",
    "windsurf": "Windsurf",
    "subl": "Sublime Text",
    "zed": "Zed",
}


class FileWriteRequest(BaseModel):
    path: str
    content: str
    project_root: Optional[str] = None


class OpenFileRequest(BaseModel):
    filepath: str
    line: Optional[int] = None
    column: Optional[int] = None
    project_root: Optional[str] = None
    editor: Optional[str] = None


class OpenProjectRequest(BaseModel):
    project_path: str
    editor: Optional[str] = None


class OpenFileResponse(BaseModel):
    success: bool
    message: str
    method: str


def resolve_path(filepath: str, project_root: Optional[str] = None) -> str:
    if os.path.isabs(filepath):
        return os.path.normpath(filepath)
    if project_root:
        candidate = os.path.normpath(os.path.join(project_root, filepath))
        if os.path.exists(candidate):
            return candidate
    return os.path.normpath(os.path.abspath(filepath))


def _validate_target_path(
    filepath: str,
    project_root: Optional[str] = None,
    *,
    must_exist: bool = False,
    expect_directory: bool = False,
) -> str:
    resolved = Path(resolve_path(filepath, project_root)).resolve()
    resolved_str = str(resolved)

    if any(ch in resolved_str for ch in ("\x00", "\n", "\r")):
        raise ValueError("Invalid path")
    if not os.path.isabs(resolved_str):
        raise ValueError("Path must be absolute")
    if not _SAFE_PATH_CHARS.fullmatch(resolved_str):
        raise ValueError("Path contains unsupported characters")
    if resolved.name.startswith("-"):
        raise ValueError("Invalid path")

    if project_root:
        root = Path(project_root).resolve()
        try:
            resolved.relative_to(root)
        except ValueError as exc:
            raise ValueError("Path must be within project root") from exc

    if must_exist and not resolved.exists():
        raise FileNotFoundError("Path does not exist")

    if expect_directory and resolved.exists() and not resolved.is_dir():
        raise NotADirectoryError("Path is not a directory")

    return resolved_str


def _is_duplicate_open_request(key: str) -> bool:
    now = time.monotonic()
    with _dedup_lock:
        last_key = _last_open_request.get("key")
        last_at = float(_last_open_request.get("at") or 0.0)
        if last_key == key and (now - last_at) <= _DEDUP_WINDOW_SECONDS:
            return True
        _last_open_request["key"] = key
        _last_open_request["at"] = now
        return False


def _find_vscode_binary() -> Optional[str]:
    """Find the real VS Code binary, skipping Cursor or other imposters."""
    # Strategy 1: Check explicit VS Code install paths by platform
    if sys.platform == "win32":
        username = os.environ.get("USERNAME", "")
        candidates = [
            rf"C:\Users\{username}\AppData\Local\Programs\Microsoft VS Code\bin\code.cmd",
            r"C:\Program Files\Microsoft VS Code\bin\code.cmd",
            r"C:\Program Files (x86)\Microsoft VS Code\bin\code.cmd",
        ]
    elif sys.platform == "darwin":
        candidates = [
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
            os.path.expanduser(
                "~/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
            ),
        ]
    else:  # Linux
        candidates = [
            "/usr/bin/code",
            "/usr/local/bin/code",
            "/snap/bin/code",
        ]
        code_oss = shutil.which("code-oss")
        if code_oss:
            candidates.append(code_oss)

    for path in candidates:
        if path and os.path.exists(path):
            return path

    # Strategy 2: which("code") but verify it's NOT Cursor
    code_path = shutil.which("code")
    if code_path:
        try:
            result = subprocess.run(
                [code_path, "--version"],
                capture_output=True, text=True, timeout=3,
            )
            if ("cursor" not in result.stdout.lower()
                    and "cursor" not in code_path.lower()):
                return code_path
        except Exception:
            pass

    return None


def _open_in_vscode(resolved: str, line: Optional[int]) -> tuple[bool, str, str]:
    """Open a file/folder in VS Code specifically, never Cursor."""
    vscode = _find_vscode_binary()
    if not vscode:
        return (
            False,
            "VS Code not found. Install VS Code and ensure it's on your PATH "
            "(Help → Shell Command → Install 'code' command in PATH).",
            "None",
        )

    try:
        if line and line > 0:
            command = [vscode, "--reuse-window", "--goto", f"{resolved}:{line}"]
        else:
            command = [vscode, "--reuse-window", "--", resolved]
        subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True, "Opened in VS Code", "VS Code"
    except OSError as e:
        return False, f"Failed to launch VS Code: {e}", "None"


def _editor_executable(editor_id: str, system: str) -> str:
    if system == "Windows":
        return f"{editor_id}.cmd"
    return editor_id


def open_in_editor(
    resolved_path: str,
    line: Optional[int] = None,
    preferred_editor: Optional[str] = None,
) -> tuple[bool, str, str]:
    resolved = resolved_path

    if not os.path.exists(resolved):
        logger.warning(f"Path does not exist: {resolved!r}")

    system = platform.system()

    # When a specific editor is requested, use ONLY that editor — no fallback.
    if preferred_editor:
        preferred_editor = preferred_editor.strip().lower()
        if preferred_editor == "code":
            return _open_in_vscode(resolved, line)

        if preferred_editor not in _ALLOWED_EDITORS:
            return False, "Unsupported editor", "None"

        display_name = _ALLOWED_EDITORS[preferred_editor]
        cmd = _editor_executable(preferred_editor, system)
        try:
            command = [cmd, resolved]
            subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True, f"Opened in {display_name}", display_name
        except (OSError, FileNotFoundError):
            pass
        return False, f"{display_name} not found. Ensure '{preferred_editor}' is on your PATH.", "None"

    # No preference — try VS Code first, then other editors
    ok, msg, method = _open_in_vscode(resolved, line)
    if ok:
        return ok, msg, method

    for editor_id, name in [("cursor", "Cursor"), ("windsurf", "Windsurf")]:
        try:
            actual_cmd = _editor_executable(editor_id, system)
            command = [actual_cmd, resolved]
            subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True, f"Opened in {name}", name
        except (OSError, FileNotFoundError):
            continue

    return False, f"Could not open {resolved!r} in any editor. Install VS Code, Cursor, or Windsurf and ensure the CLI command is on PATH.", "None"


@router.post("/open", summary="Open file in editor")
async def open_file(request: OpenFileRequest) -> OpenFileResponse:
    started = time.perf_counter()
    try:
        dedup_resolved = _validate_target_path(
            request.filepath,
            request.project_root,
            must_exist=True,
        )
        if not Path(dedup_resolved).is_file():
            raise HTTPException(status_code=400, detail="Target path is not a file")

        dedup_key = f"file|{request.editor or 'auto'}|{dedup_resolved}|{request.line or 0}|{request.column or 0}"
        if _is_duplicate_open_request(dedup_key):
            elapsed = int((time.perf_counter() - started) * 1000)
            runtime_tracker.record(
                event_type="editor",
                command=f"open-duplicate:{request.editor or 'auto'}",
                status="success",
                duration_ms=elapsed,
                source="backend",
                metadata={"filepath": request.filepath},
            )
            return OpenFileResponse(success=True, message="Ignored duplicate open request", method="Duplicate Guard")

        success, message, method = open_in_editor(
            dedup_resolved,
            request.line,
            request.editor,
        )
        elapsed = int((time.perf_counter() - started) * 1000)
        if success:
            runtime_tracker.record(
                event_type="editor",
                command=f"open:{request.editor or method}",
                status="success",
                duration_ms=elapsed,
                source="backend",
                metadata={"filepath": request.filepath},
            )
            return OpenFileResponse(success=True, message=message, method=method)
        runtime_tracker.record(
            event_type="editor",
            command=f"open:{request.editor or 'auto'}",
            status="error",
            duration_ms=elapsed,
            source="backend",
            metadata={"filepath": request.filepath},
        )
        raise HTTPException(status_code=500, detail=message)
    except HTTPException:
        raise
    except (ValueError, FileNotFoundError, NotADirectoryError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to open file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open file: {str(e)}")


@router.post("/open-project", summary="Open entire project in editor")
async def open_project(body: OpenProjectRequest) -> OpenFileResponse:
    started = time.perf_counter()
    try:
        resolved = _validate_target_path(
            body.project_path,
            must_exist=True,
            expect_directory=True,
        )

        dedup_key = f"project|{body.editor or 'auto'}|{resolved}"
        if _is_duplicate_open_request(dedup_key):
            elapsed = int((time.perf_counter() - started) * 1000)
            runtime_tracker.record(
                event_type="editor",
                command=f"open-project-duplicate:{body.editor or 'auto'}",
                status="success",
                duration_ms=elapsed,
                source="backend",
                metadata={"project_path": body.project_path},
            )
            return OpenFileResponse(success=True, message="Ignored duplicate open request", method="Duplicate Guard")

        success, message, method = open_in_editor(resolved, preferred_editor=body.editor)
        elapsed = int((time.perf_counter() - started) * 1000)
        if success:
            runtime_tracker.record(
                event_type="editor",
                command=f"open-project:{body.editor or method}",
                status="success",
                duration_ms=elapsed,
                source="backend",
                metadata={"project_path": body.project_path},
            )
            return OpenFileResponse(success=True, message=message, method=method)
        runtime_tracker.record(
            event_type="editor",
            command=f"open-project:{body.editor or 'auto'}",
            status="error",
            duration_ms=elapsed,
            source="backend",
            metadata={"project_path": body.project_path},
        )
        raise HTTPException(status_code=500, detail=message)
    except HTTPException:
        raise
    except (ValueError, FileNotFoundError, NotADirectoryError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to open project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open project: {str(e)}")


@router.get("/detect", summary="Detect available editors")
async def detect_editors():
    available = []

    # Check for real VS Code first via explicit binary detection
    vscode_bin = _find_vscode_binary()
    if vscode_bin:
        try:
            result = subprocess.run([vscode_bin, "--version"], capture_output=True, text=True, timeout=2)
            version = result.stdout.strip().split('\n')[0][:50] if result.returncode == 0 else "unknown"
            available.append({"command": "code", "name": "VS Code", "description": "Microsoft Visual Studio Code", "version": version})
        except Exception:
            available.append({"command": "code", "name": "VS Code", "description": "Microsoft Visual Studio Code", "version": "found"})

    other_editors = [
        ("cursor", "Cursor", "AI-first code editor"),
        ("windsurf", "Windsurf", "AI-powered IDE by Codeium"),
        ("subl", "Sublime Text", "Sublime Text"),
        ("zed", "Zed", "Zed editor"),
    ]
    for cmd, name, description in other_editors:
        try:
            result = subprocess.run([cmd, "--version"], capture_output=True, timeout=2)
            if result.returncode == 0:
                version = result.stdout.decode().strip().split('\n')[0][:50]
                available.append({"command": cmd, "name": name, "description": description, "version": version})
        except Exception:
            pass
    return {
        "available_editors": available,
        "default_editor": available[0]["name"] if available else None,
        "platform": platform.system(),
    }


@router.post("/write", summary="Atomic file write — write to tmp then rename")
async def write_file(req: FileWriteRequest):
    """
    Write file content atomically: write to a .tmp sibling first, then rename.
    Path must be within project_root.
    """
    try:
        resolved = _validate_target_path(req.path, req.project_root)
    except (ValueError, FileNotFoundError, NotADirectoryError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    target = Path(resolved)
    tmp_path = target.with_suffix(target.suffix + ".archy_tmp")

    try:
        tmp_path.write_text(req.content, encoding="utf-8")
        tmp_path.replace(target)
        return {
            "success": True,
            "path": str(target),
            "size": len(req.content.encode("utf-8")),
        }
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied writing to file")
    except Exception as e:
        logger.error(f"File write failed: {e}")
        # Clean up tmp if it exists
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Write failed: {str(e)}")
