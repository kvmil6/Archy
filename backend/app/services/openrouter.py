import httpx
import os
from typing import List, Dict, Optional, Union
from ..config import get_settings


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
        yield "data: Error: OPENROUTER_API_KEY not configured\n\n"
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
                    detail = body.decode(errors="replace")[:200]
                    if response.status_code == 404:
                        yield f'data: {{"error": "Model not found — check your OpenRouter model ID in settings. Got: {model_name}"}}\n\n'
                    else:
                        yield f'data: {{"error": "HTTP {response.status_code}: {detail}"}}\n\n'
                    return

                async for line in response.aiter_lines():
                    if line:
                        # OpenRouter returns lines like "data: {...}" — pass through
                        if line.startswith("data: "):
                            yield f"{line}\n\n"
                        else:
                            yield f"data: {line}\n\n"
        except Exception as e:
            yield f'data: {{"error": "{str(e)}"}}\n\n'
