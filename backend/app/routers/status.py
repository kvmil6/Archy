"""
Status Router - API health and configuration status

Live-reads .env and environment so that external edits show up
without restarting the backend.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os
import sys
import platform

router = APIRouter(prefix="/status", tags=["status"])


class APIStatus(BaseModel):
    ai_available: bool
    openrouter_configured: bool
    message: str
    has_api_key: bool
    key_source: Optional[str] = None  # 'env' | 'dotenv' | 'runtime' | None


class SystemStatus(BaseModel):
    backend_online: bool
    version: str
    ai_status: APIStatus


def _find_env_file() -> Optional[str]:
    """Search for .env file starting from backend dir, going up to repo root."""
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # Check backend/.env first, then repo root
    candidates = [
        os.path.join(here, '.env'),  # backend/.env
        os.path.join(here, '..', '.env'),  # repo root .env
    ]
    for path in candidates:
        normalized = os.path.normpath(path)
        if os.path.isfile(normalized):
            return normalized
    return None


def _get_live_api_key() -> tuple[Optional[str], Optional[str]]:
    """
    Live-read API key from multiple sources in priority order.
    Returns (key, source).
    """
    # 1. Runtime env (set via POST /config/api-key)
    env_key = os.environ.get('OPENROUTER_API_KEY')
    if env_key and env_key.startswith('sk-or'):
        return env_key, 'env'
    
    # 2. Freshly read .env file (catches external edits)
    env_path = _find_env_file()
    if env_path:
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('#') or '=' not in line:
                        continue
                    key, _, value = line.partition('=')
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key == 'OPENROUTER_API_KEY' and value.startswith('sk-or'):
                        # Also update runtime env so other modules see it
                        os.environ['OPENROUTER_API_KEY'] = value
                        return value, 'dotenv'
        except Exception:
            pass
    
    return None, None


@router.get("/ai", summary="Check AI API status")
async def check_ai_status() -> APIStatus:
    """
    Live-checks AI availability. Re-reads .env on every call so
    external edits are reflected immediately.
    """
    key, source = _get_live_api_key()
    has_key = bool(key)
    
    return APIStatus(
        ai_available=has_key,
        openrouter_configured=has_key,
        has_api_key=has_key,
        key_source=source,
        message=(
            f"AI ready · key loaded from {source}" if has_key
            else "Set OPENROUTER_API_KEY in .env or configure via the panel below."
        ),
    )


@router.get("/system", summary="Check system status")
async def check_system_status() -> SystemStatus:
    """
    Returns overall system status including AI availability.
    """
    key, source = _get_live_api_key()
    has_key = bool(key)
    
    return SystemStatus(
        backend_online=True,
        version="0.3.0",
        ai_status=APIStatus(
            ai_available=has_key,
            openrouter_configured=has_key,
            has_api_key=has_key,
            key_source=source,
            message="AI ready" if has_key else "OpenRouter API key not configured",
        ),
    )


@router.get("/health", summary="Health check")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "healthy", "service": "archy-api"}


@router.get("/runtime-info", summary="Runtime environment info")
async def runtime_info():
    return {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "platform": platform.system(),
        "arch": platform.machine(),
    }
