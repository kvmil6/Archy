# Archy — AI Prompts Reference

## How AI is used in Archy

Archy uses OpenRouter as an LLM gateway. All AI calls are optional — the core parsing, graph rendering, and security scanning work without any API key.

## Prompt Patterns

### Brain Chat (`/brain/chat`)
- System prompt loaded from `prompts/brain_chat_system.md` via `prompt_library`
- Template variables: `{{FRAMEWORK}}`, `{{PROJECT_CONTEXT}}`, `{{MARKDOWN_CONTEXT}}`
- Project context includes: file tree (grouped by folder, top 15), metrics, dependency graph edges (top 40)
- Markdown knowledge base injected for architecture guidance
- Model: first in `AVAILABLE_MODELS`, temperature 0.4, max_tokens 1200

### File Insight (`/file-insight/analyze`)
- Streaming SSE response
- Sends file content + framework context + optional project context
- Used for deep analysis: purpose, patterns, risks, refactoring suggestions

### Security Scan Summary (`/brain/security-scan`)
- Static regex scan runs first (always)
- If API key available, sends findings to AI for a 3-4 sentence professional assessment
- Model: first in `AVAILABLE_MODELS`, temperature default, max_tokens 300
- Falls back to static summary if AI call fails

### Architecture Analysis (`/analyze`)
- Converts ReactFlow graph to a text prompt via `graph_to_prompt.py`
- Streams the AI response as SSE

## Prompt Library

Prompts are stored in `backend/prompts/` as Markdown files. The `prompt_library` service loads and renders them with variable substitution. If a prompt file is missing, a hardcoded fallback is used.

## Model Configuration

Default models are set in `app/config.py` → `AVAILABLE_MODELS`. Override via `.env`:

```
AVAILABLE_MODELS=anthropic/claude-sonnet-4-5,openai/gpt-4o,google/gemini-2.0-flash-001
```

The frontend can also send a custom model ID — the backend passes it through to OpenRouter.
