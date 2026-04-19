"""
Git Information Router

Provides git metadata for project files:
- Last commit info per file (author, date, message)
- File status (modified, untracked, staged)
- Branch info and recent commits
"""
from __future__ import annotations

import subprocess
import os
import logging
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/git", tags=["git"])


class GitInfoRequest(BaseModel):
    project_path: str
    files: Optional[List[str]] = None  # If None, returns info for all tracked files


class FileGitStatus(BaseModel):
    path: str
    status: str  # 'modified' | 'untracked' | 'staged' | 'clean' | 'deleted'
    last_commit_hash: Optional[str] = None
    last_commit_message: Optional[str] = None
    last_commit_author: Optional[str] = None
    last_commit_date: Optional[str] = None
    additions: Optional[int] = None
    deletions: Optional[int] = None


class GitProjectInfo(BaseModel):
    is_git_repo: bool
    branch: Optional[str] = None
    remote_url: Optional[str] = None
    total_commits: Optional[int] = None
    last_commit: Optional[Dict[str, str]] = None
    uncommitted_changes: int = 0
    file_statuses: Dict[str, FileGitStatus] = {}


def _run_git(args: List[str], cwd: str, timeout: int = 10) -> Optional[str]:
    """Run a git command safely and return stdout, or None on error."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


def _is_git_repo(path: str) -> bool:
    out = _run_git(["rev-parse", "--is-inside-work-tree"], cwd=path)
    return out == "true"


@router.post("/project-info", summary="Get git metadata for a project")
async def get_project_git_info(body: GitInfoRequest) -> GitProjectInfo:
    """
    Returns git status, branch, and per-file last-commit metadata for a project.
    Runs git commands via subprocess (requires git to be installed).
    """
    project_path = body.project_path

    # Validate path exists and is a directory
    if not project_path or not os.path.isdir(project_path):
        raise HTTPException(status_code=400, detail="project_path must be an existing directory")

    if not _is_git_repo(project_path):
        return GitProjectInfo(is_git_repo=False)

    # Branch
    branch = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=project_path)

    # Remote URL
    remote_url = _run_git(["remote", "get-url", "origin"], cwd=project_path)

    # Total commits
    total_str = _run_git(["rev-list", "--count", "HEAD"], cwd=project_path)
    total_commits = int(total_str) if total_str and total_str.isdigit() else None

    # Last commit
    last_commit_raw = _run_git(
        ["log", "-1", "--format=%H|%s|%an|%ar"],
        cwd=project_path,
    )
    last_commit: Optional[Dict[str, str]] = None
    if last_commit_raw:
        parts = last_commit_raw.split("|", 3)
        if len(parts) == 4:
            last_commit = {
                "hash": parts[0][:8],
                "message": parts[1],
                "author": parts[2],
                "date": parts[3],
            }

    # Status (porcelain v1)
    status_raw = _run_git(["status", "--porcelain"], cwd=project_path) or ""
    uncommitted = len([l for l in status_raw.splitlines() if l.strip()])

    # Build file statuses
    file_statuses: Dict[str, FileGitStatus] = {}

    # Map status codes
    status_map = {
        "M ": "staged", " M": "modified", "MM": "modified",
        "A ": "staged", " A": "staged", "D ": "staged",
        " D": "deleted", "??": "untracked", "!!": "ignored",
    }

    for line in status_raw.splitlines():
        if len(line) < 3:
            continue
        code = line[:2]
        file_path = line[3:].strip()
        # Handle renames: "old -> new"
        if " -> " in file_path:
            file_path = file_path.split(" -> ")[-1]
        status = status_map.get(code, "unknown")
        file_statuses[file_path] = FileGitStatus(path=file_path, status=status)

    # Per-file last commit (only for requested files or sampled tracked files)
    files_to_check = body.files or []
    if not files_to_check:
        # Get the 50 most recently touched files
        recently_touched = _run_git(
            ["log", "--pretty=format:", "--name-only", "-n", "200"],
            cwd=project_path,
        )
        if recently_touched:
            seen: set = set()
            for f in recently_touched.splitlines():
                f = f.strip()
                if f and f not in seen:
                    seen.add(f)
                    files_to_check.append(f)
                    if len(files_to_check) >= 50:
                        break

    for rel_path in files_to_check[:100]:
        log_out = _run_git(
            ["log", "-1", "--format=%h|%s|%an|%ar", "--", rel_path],
            cwd=project_path,
        )
        if not log_out:
            continue
        parts = log_out.split("|", 3)
        if len(parts) < 4:
            continue
        existing = file_statuses.get(rel_path, FileGitStatus(path=rel_path, status="clean"))
        existing.last_commit_hash = parts[0]
        existing.last_commit_message = parts[1]
        existing.last_commit_author = parts[2]
        existing.last_commit_date = parts[3]
        file_statuses[rel_path] = existing

    return GitProjectInfo(
        is_git_repo=True,
        branch=branch,
        remote_url=remote_url,
        total_commits=total_commits,
        last_commit=last_commit,
        uncommitted_changes=uncommitted,
        file_statuses=file_statuses,
    )


@router.post("/file-blame", summary="Get git blame for a specific file")
async def get_file_blame(body: dict) -> Dict[str, Any]:
    """
    Returns git blame output for a file, grouped by author and line ranges.
    """
    project_path = body.get("project_path", "")
    file_path = body.get("file_path", "")

    if not project_path or not file_path:
        raise HTTPException(status_code=400, detail="project_path and file_path required")
    if not os.path.isdir(project_path):
        raise HTTPException(status_code=400, detail="project_path does not exist")

    blame_out = _run_git(
        ["blame", "--line-porcelain", file_path],
        cwd=project_path,
        timeout=15,
    )
    if not blame_out:
        return {"blame": [], "error": "git blame failed or file not tracked"}

    # Parse porcelain blame output
    blame_lines = []
    current: Dict[str, str] = {}
    for line in blame_out.splitlines():
        if line.startswith("\t"):
            # Actual source line
            if current:
                blame_lines.append({
                    "hash": current.get("hash", "")[:8],
                    "author": current.get("author", "Unknown"),
                    "time": current.get("author-time", ""),
                    "summary": current.get("summary", ""),
                    "line": line[1:],
                })
            current = {}
        elif " " in line:
            parts = line.split(" ", 1)
            key = parts[0]
            val = parts[1] if len(parts) > 1 else ""
            if len(key) == 40:  # SHA1 hash
                current["hash"] = key
            else:
                current[key] = val

    return {"blame": blame_lines[:500]}  # Cap at 500 lines
