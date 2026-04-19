"""
Part 1E — Backend AI Proxy.

All AI requests go through this endpoint. Never directly from the browser.
Routes to OpenRouter by default, or to a custom endpoint (e.g. Ollama).
Streams SSE back to the frontend and appends a final usage event.
"""
import json
import logging
from typing import List, Dict, Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai-proxy"])


class AIChatMessage(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    model: str
    messages: List[AIChatMessage]
    stream: bool = True
    endpoint_override: Optional[str] = None
    api_key_override: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    response_format: Optional[Dict] = None


@router.post("/chat", summary="Unified AI proxy — streams SSE to frontend")
async def ai_chat(request: AIChatRequest):
    settings = get_settings()

    # Determine target URL
    if request.endpoint_override:
        base_url = request.endpoint_override.rstrip("/")
    else:
        base_url = settings.OPENROUTER_BASE_URL

    url = f"{base_url}/chat/completions"

    # Determine API key
    import os
    api_key = request.api_key_override or os.environ.get("OPENROUTER_API_KEY") or settings.OPENROUTER_API_KEY

    # Build headers — omit Authorization for Ollama (no key)
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    is_ollama = "localhost:11434" in base_url or "127.0.0.1:11434" in base_url

    if api_key and not is_ollama:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["HTTP-Referer"] = "http://localhost:5173"
        headers["X-Title"] = "Archy"

    # Build request body
    body: Dict = {
        "model": request.model,
        "messages": [m.model_dump() for m in request.messages],
        "stream": request.stream,
    }
    if request.max_tokens is not None:
        body["max_tokens"] = request.max_tokens
    if request.temperature is not None:
        body["temperature"] = request.temperature
    if request.response_format is not None:
        body["response_format"] = request.response_format

    if request.stream:
        return StreamingResponse(
            _stream_sse(url, headers, body),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        return await _non_streaming(url, headers, body)


async def _stream_sse(url: str, headers: Dict, body: Dict):
    """Stream SSE from upstream and append a final usage event."""
    input_tokens = 0
    output_tokens = 0

    async with httpx.AsyncClient() as client:
        try:
            async with client.stream(
                "POST", url, headers=headers, json=body, timeout=120.0,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    detail = error_body.decode(errors="replace")[:300]
                    yield f'data: {{"error": "HTTP {response.status_code}: {detail}"}}\n\n'
                    return

                # Try to extract usage from OpenRouter x-usage header
                x_usage = response.headers.get("x-usage")
                if x_usage:
                    try:
                        usage_data = json.loads(x_usage)
                        input_tokens = usage_data.get("prompt_tokens", 0)
                        output_tokens = usage_data.get("completion_tokens", 0)
                    except (json.JSONDecodeError, TypeError):
                        pass

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    # Pass through SSE lines
                    if line.startswith("data: "):
                        # Try to extract usage from the final chunk
                        if line.startswith("data: {"):
                            try:
                                chunk = json.loads(line[6:])
                                usage = chunk.get("usage")
                                if usage:
                                    input_tokens = usage.get("prompt_tokens", input_tokens)
                                    output_tokens = usage.get("completion_tokens", output_tokens)
                            except (json.JSONDecodeError, TypeError):
                                pass
                        yield f"{line}\n\n"
                    elif line.strip() == "[DONE]":
                        yield "data: [DONE]\n\n"
                    else:
                        yield f"data: {line}\n\n"

        except httpx.TimeoutException:
            yield 'data: {"error": "Request timed out after 120s"}\n\n'
        except Exception as e:
            logger.error(f"AI proxy stream error: {e}")
            yield f'data: {{"error": "{str(e)}"}}\n\n'

    # Always send a final usage event
    yield f'data: {{"type": "usage", "input_tokens": {input_tokens}, "output_tokens": {output_tokens}}}\n\n'


async def _non_streaming(url: str, headers: Dict, body: Dict):
    """Non-streaming AI request. Returns JSON directly."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=body, timeout=120.0)
            if response.status_code != 200:
                detail = response.text[:300]
                return {"error": f"HTTP {response.status_code}: {detail}"}

            data = response.json()

            # Extract usage
            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            # Attach usage to response
            data["_archy_usage"] = {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }
            return data

        except httpx.TimeoutException:
            return {"error": "Request timed out after 120s"}
        except Exception as e:
            logger.error(f"AI proxy non-stream error: {e}")
            return {"error": str(e)}
