import httpx
import json
import os
from typing import List, Dict, Optional, Union
from ..config import get_settings


def _map_openrouter_error(status_code: int, detail: str, model_name: str) -> tuple[int, str]:
    raw = (detail or '').strip()
    trimmed = raw[:300]

    if status_code in (401, 403):
        return 401, 'OpenRouter rejected the API key. Check backend/.env and retry.'
    if status_code == 402:
        return 402, 'OpenRouter billing issue (Payment Required). Add credits or switch to a free model.'
    if status_code == 404:
        return 502, f'Model not found — check your OpenRouter model ID. Got: {model_name}'
    if status_code == 429:
        return 429, 'OpenRouter rate limit reached. Wait a moment and retry.'
    if status_code >= 500:
        return 502, 'OpenRouter is temporarily unavailable. Try again in a moment.'

    msg = f'AI provider error (HTTP {status_code})'
    if trimmed:
        msg = f'{msg}: {trimmed}'
    return 502, msg


async def stream_openrouter(
    prompt_or_messages: Union[str, List[Dict[str, str]]],
    model: Optional[str] = None,
):
    """
    Connects to OpenRouter and streams the response as SSE.
    
    Accepts either:
    - A string prompt (backward compat), or
    - A list of {role, content} messages for multi-turn / system prompt support
    """
    settings = get_settings()
    # Live-read: prefer the runtime env var (set by /config/api-key) over cached settings
    api_key = os.environ.get('OPENROUTER_API_KEY') or settings.OPENROUTER_API_KEY

    if not api_key:
        yield 'data: {"error": "OpenRouter API key not configured.", "status_code": 400}\n\n'
        yield "data: [DONE]\n\n"
        return

    # Normalize to messages
    if isinstance(prompt_or_messages, str):
        messages = [{"role": "user", "content": prompt_or_messages}]
    else:
        messages = prompt_or_messages

    model_name = model or settings.available_models_list[0]

    async with httpx.AsyncClient() as client:
        try:
            async with client.stream(
                "POST",
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Archy",
                },
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": True,
                },
                timeout=120.0,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    detail = body.decode(errors="replace")
                    mapped_status, mapped_error = _map_openrouter_error(response.status_code, detail, model_name)
                    payload = {
                        "error": mapped_error,
                        "status_code": mapped_status,
                        "upstream_status": response.status_code,
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                async for line in response.aiter_lines():
                    if line:
                        # OpenRouter returns lines like "data: {...}" — pass through
                        if line.startswith("data: "):
                            yield f"{line}\n\n"
                        else:
                            yield f"data: {line}\n\n"
        except Exception as e:
            yield f'data: {{"error": "{str(e)}", "status_code": 500}}\n\n'
            yield "data: [DONE]\n\n"
