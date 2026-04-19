"""
Configuration Router - Runtime config updates

Writes to the correct .env file (tries repo root first, then backend/.env)
and updates os.environ immediately so other code sees the change without restart.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/config", tags=["config"])


class APIKeyUpdate(BaseModel):
    openrouter_api_key: str


class APIKeyValidate(BaseModel):
    openrouter_api_key: Optional[str] = None  # if None, validate the currently-set key


class ConfigResponse(BaseModel):
    success: bool
    message: str
    env_file: Optional[str] = None


class ValidationResult(BaseModel):
    valid: bool
    status: str  # 'online' | 'invalid' | 'network_error' | 'rate_limited'
    message: str
    latency_ms: Optional[int] = None
    credits_remaining: Optional[float] = None
    account_tier: Optional[str] = None


async def _validate_openrouter_key(key: str, timeout: float = 10.0) -> ValidationResult:
    """
    Pings OpenRouter with a minimal request to verify the key works.
    Returns structured ValidationResult instead of raising.
    """
    import time
    if not key or not key.startswith('sk-or'):
        return ValidationResult(
            valid=False,
            status='invalid',
            message="Invalid key format — OpenRouter keys start with 'sk-or-'",
        )

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            # GET /auth/key is the official endpoint to check a key without burning credits
            response = await client.get(
                'https://openrouter.ai/api/v1/auth/key',
                headers={
                    'Authorization': f'Bearer {key}',
                    'HTTP-Referer': 'http://localhost:5173',
                    'X-Title': 'Archy',
                },
            )
            latency_ms = int((time.monotonic() - start) * 1000)

            if response.status_code == 200:
                data = response.json().get('data', {})
                usage = data.get('usage', 0)
                limit = data.get('limit')
                credits = None
                if limit is not None:
                    try:
                        credits = round(float(limit) - float(usage), 4)
                    except (TypeError, ValueError):
                        credits = None
                return ValidationResult(
                    valid=True,
                    status='online',
                    message='Connected to OpenRouter',
                    latency_ms=latency_ms,
                    credits_remaining=credits,
                    account_tier=data.get('label') or ('free' if data.get('is_free_tier') else 'paid'),
                )
            elif response.status_code == 401:
                return ValidationResult(
                    valid=False,
                    status='invalid',
                    message='Authentication failed — key is invalid or revoked',
                    latency_ms=latency_ms,
                )
            elif response.status_code == 429:
                return ValidationResult(
                    valid=False,
                    status='rate_limited',
                    message='Rate limited — try again in a moment',
                    latency_ms=latency_ms,
                )
            else:
                return ValidationResult(
                    valid=False,
                    status='network_error',
                    message=f'OpenRouter returned HTTP {response.status_code}',
                    latency_ms=latency_ms,
                )
    except httpx.TimeoutException:
        return ValidationResult(
            valid=False,
            status='network_error',
            message=f'Request timed out after {timeout}s — check your internet connection',
        )
    except httpx.ConnectError:
        return ValidationResult(
            valid=False,
            status='network_error',
            message='Cannot reach openrouter.ai — check your internet connection',
        )
    except Exception as e:
        logger.warning(f'API key validation failed: {e}')
        return ValidationResult(
            valid=False,
            status='network_error',
            message=f'Validation failed: {str(e)[:100]}',
        )


def _resolve_env_path() -> str:
    """
    Find the best .env file to write to.
    Prefers an existing file (repo root or backend/), otherwise creates
    backend/.env.
    """
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    root_env = os.path.normpath(os.path.join(backend_dir, '..', '.env'))
    backend_env = os.path.join(backend_dir, '.env')
    
    # Prefer existing file
    if os.path.isfile(root_env):
        return root_env
    if os.path.isfile(backend_env):
        return backend_env
    
    # Neither exists — create backend/.env
    return backend_env


def _read_env(path: str) -> dict[str, str]:
    """Read .env file into a dict, preserving non-KV comment lines separately is not needed here."""
    result: dict[str, str] = {}
    if not os.path.isfile(path):
        return result
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith('#'):
                    continue
                if '=' in stripped:
                    k, _, v = stripped.partition('=')
                    result[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return result


def _write_env(path: str, values: dict[str, str]) -> None:
    """Write .env file, trying to preserve comments from existing file."""
    # Read existing file line-by-line
    existing_lines: list[str] = []
    if os.path.isfile(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                existing_lines = f.readlines()
        except Exception:
            existing_lines = []
    
    # Update existing lines and track which keys were updated
    written_keys: set[str] = set()
    new_lines: list[str] = []
    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split('=', 1)[0].strip()
        if key in values:
            new_lines.append(f"{key}={values[key]}\n")
            written_keys.add(key)
        else:
            new_lines.append(line)
    
    # Append any keys not yet written
    for key, value in values.items():
        if key not in written_keys:
            if new_lines and not new_lines[-1].endswith('\n'):
                new_lines.append('\n')
            new_lines.append(f"{key}={value}\n")
    
    # Make sure parent dir exists
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)


def _clear_settings_cache() -> None:
    """Clear the lru_cache on get_settings so next call re-reads env."""
    try:
        from ..config import get_settings
        get_settings.cache_clear()
    except Exception:
        pass


class SaveAndValidateResult(BaseModel):
    """Combined save + validation response for the save API flow."""
    saved: bool
    env_file: Optional[str] = None
    validation: ValidationResult


@router.post(
    "/api-key",
    response_model=SaveAndValidateResult,
    summary="Save OpenRouter API key and validate it live",
)
async def update_api_key(config: APIKeyUpdate) -> SaveAndValidateResult:
    """
    Validates the key against OpenRouter's /auth/key endpoint, then saves it
    to .env and runtime environment. Returns a structured response showing
    both save and validation outcomes.
    
    The key is saved even if validation fails (network issues, etc.), so the
    user can retry the connection later without re-entering their key.
    """
    key = config.openrouter_api_key.strip()
    
    # Quick format check — don't even try to save garbage
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty.")
    if not key.startswith('sk-or'):
        raise HTTPException(
            status_code=400,
            detail="Invalid API key format. OpenRouter keys start with 'sk-or-'."
        )
    
    # 1. Validate against OpenRouter
    validation = await _validate_openrouter_key(key)
    
    # 2. Save to .env (even if validation failed — user may fix connection later)
    env_path: Optional[str] = None
    saved = False
    try:
        os.environ['OPENROUTER_API_KEY'] = key
        env_path = _resolve_env_path()
        existing = _read_env(env_path)
        existing['OPENROUTER_API_KEY'] = key
        _write_env(env_path, existing)
        _clear_settings_cache()
        saved = True
    except Exception as e:
        logger.error(f"Failed to save API key: {e}")
        # Don't raise — return the partial result
    
    return SaveAndValidateResult(
        saved=saved,
        env_file=env_path,
        validation=validation,
    )


@router.post(
    "/validate-api-key",
    response_model=ValidationResult,
    summary="Validate an API key without saving it",
)
async def validate_api_key(body: APIKeyValidate = APIKeyValidate()) -> ValidationResult:
    """
    Ping OpenRouter's /auth/key endpoint to verify a key works.
    If no key is provided, validates the currently-configured key from env/.env.
    Does not burn credits (uses the lightweight auth/key endpoint).
    """
    key: Optional[str] = body.openrouter_api_key
    if not key or not key.strip():
        # Fall back to currently-configured key
        key = os.environ.get('OPENROUTER_API_KEY', '').strip()
        if not key:
            # Try reading from .env fresh
            env_path = _resolve_env_path()
            env_values = _read_env(env_path)
            key = env_values.get('OPENROUTER_API_KEY', '').strip()
    
    if not key:
        return ValidationResult(
            valid=False,
            status='invalid',
            message='No API key configured',
        )
    
    return await _validate_openrouter_key(key.strip())


@router.get("/api-key", summary="Check if API key is configured")
async def check_api_key():
    """Returns whether an API key is configured (without exposing the key)."""
    # Check os.environ first (live)
    env_key = os.environ.get('OPENROUTER_API_KEY', '')
    if env_key.startswith('sk-or'):
        return {
            "configured": True,
            "message": "API key is configured",
            "source": "env",
        }
    
    # Fall back to .env file check
    env_path = _resolve_env_path()
    env_values = _read_env(env_path)
    stored_key = env_values.get('OPENROUTER_API_KEY', '')
    if stored_key.startswith('sk-or'):
        os.environ['OPENROUTER_API_KEY'] = stored_key  # sync to runtime
        return {
            "configured": True,
            "message": "API key is configured (loaded from .env)",
            "source": "dotenv",
        }
    
    return {
        "configured": False,
        "message": "API key not configured",
        "source": None,
    }
