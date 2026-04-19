from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from ..services.openrouter import stream_openrouter
from ..services.python_parser import PythonParser
from ..config import get_settings
from ..services.prompt_library import prompt_library
from ..services.markdown_knowledge import markdown_knowledge_base
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/file-insight", tags=["file-insight"])


class FileInsightRequest(BaseModel):
    filepath: str
    content: str
    model: Optional[str] = None
    framework: Optional[str] = None
    project_context: Optional[List[str]] = None


def build_deep_analysis_prompt(
    filepath: str,
    content: str,
    framework: Optional[str] = None,
    project_context: Optional[List[str]] = None,
) -> str:
    parser = PythonParser()
    parsed = parser.parse_file(filepath, content)
    facts = []
    facts.append(f"File: {filepath}")
    facts.append(f"Type: {parsed.file_type}")
    facts.append(f"Lines: {parsed.line_count}")
    facts.append(f"Total complexity: {parsed.complexity}")
    
    if parsed.classes:
        facts.append(f"\nClasses ({len(parsed.classes)}):")
        for c in parsed.classes:
            role_bits = []
            if c.is_model: role_bits.append("Django Model")
            if c.is_view: role_bits.append("View")
            if c.is_viewset: role_bits.append("ViewSet")
            if c.is_serializer: role_bits.append("Serializer")
            if c.is_admin: role_bits.append("Admin")
            role = f" [{', '.join(role_bits)}]" if role_bits else ""
            
            bases = f" extends {', '.join(c.bases)}" if c.bases else ""
            facts.append(f"  - {c.name}{bases}{role}")
            facts.append(f"    methods: {', '.join(c.methods[:10])}{'...' if len(c.methods) > 10 else ''}")
    
    if parsed.functions:
        facts.append(f"\nTop-level functions ({len(parsed.functions)}):")
        for f in parsed.functions[:20]:
            decorators = f" (@{', @'.join(f.decorators)})" if f.decorators else ""
            async_mark = "async " if f.is_async else ""
            route_mark = " [ROUTE]" if f.is_route else ""
            facts.append(f"  - {async_mark}{f.name}({', '.join(f.args[:5])}){decorators}{route_mark} · cx={f.complexity}")
    
    if parsed.imports:
        facts.append(f"\nKey imports:")
        for i in parsed.imports[:15]:
            facts.append(f"  - from {i.module} import {', '.join(i.names[:5])}")
    
    facts_text = "\n".join(facts)

    framework_note = ""
    if framework == 'django':
        framework_note = "Framework: Django. Emphasize QuerySet efficiency, domain boundaries, admin design, and migration-safe model evolution."
    elif framework == 'fastapi':
        framework_note = "Framework: FastAPI. Emphasize dependency injection boundaries, async correctness, response model contracts, and transport-domain separation."
    elif framework == 'flask':
        framework_note = "Framework: Flask. Emphasize blueprint boundaries, application factory usage, extension lifecycle, and request-context isolation."
    
    context_note = ""
    if project_context:
        related = [p for p in project_context if p != filepath][:20]
        if related:
            context_note = "Project contains these related files:\n" + "\n".join(f"- {p}" for p in related)

    source_code = content[:6000] + ('...[truncated]' if len(content) > 6000 else '')
    markdown_context = markdown_knowledge_base.build_context(max_chars=3500) or ""
    fallback = "Analyze this file with architecture-focused depth.\n\n{{FACTS}}\n\n{{SOURCE_CODE}}"

    return prompt_library.render(
        "deep_file_analysis.md",
        {
            "FRAMEWORK_NOTE": framework_note or "Framework: generic Python backend.",
            "MARKDOWN_CONTEXT": markdown_context,
            "PROJECT_CONTEXT_NOTE": context_note or "No additional file context provided.",
            "FACTS": facts_text,
            "SOURCE_CODE": source_code,
        },
        fallback=fallback,
    )


@router.post("/analyze", summary="Deep AI analysis of a single file")
async def analyze_file(request: FileInsightRequest):
    settings = get_settings()
    api_key = os.environ.get('OPENROUTER_API_KEY') or settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenRouter API key not configured. Set OPENROUTER_API_KEY or select 'No AI' mode."
        )
    
    prompt = build_deep_analysis_prompt(
        filepath=request.filepath,
        content=request.content,
        framework=request.framework,
        project_context=request.project_context,
    )
    
    messages = [
        {"role": "system", "content": "You are a senior Python backend architect with 15 years of experience. You give concrete, actionable advice."},
        {"role": "user", "content": prompt},
    ]
    
    model = request.model or settings.AVAILABLE_MODELS.split(",")[0].strip()
    
    try:
        return StreamingResponse(
            stream_openrouter(messages, model=model),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"File insight stream failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prompt", summary="Get the prompt without calling AI (useful for preview/copy)")
async def get_prompt(request: FileInsightRequest):
    prompt = build_deep_analysis_prompt(
        filepath=request.filepath,
        content=request.content,
        framework=request.framework,
        project_context=request.project_context,
    )
    return {"prompt": prompt, "character_count": len(prompt)}
