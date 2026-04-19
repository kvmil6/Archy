from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..services.ai_brain import analyze_project_files
from ..services.openrouter import stream_openrouter
from ..config import get_settings
from ..services.prompt_library import prompt_library
from ..services.markdown_knowledge import markdown_knowledge_base
import logging
import os
import json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/brain", tags=["ai-brain"])


class FileContent(BaseModel):
    path: str
    content: str


class BrainAnalyzeRequest(BaseModel):
    files: List[FileContent]
    project_name: Optional[str] = "project"


class FileAnalysisResponse(BaseModel):
    path: str
    file_type: str
    language: str
    purpose: str
    functions: List[str]
    imports: List[str]
    line_count: int
    complexity_score: int
    relationships: List[Dict[str, Any]]


class ProjectMetrics(BaseModel):
    total_files: int
    total_lines: int
    average_complexity: float
    language_distribution: Dict[str, int]
    type_distribution: Dict[str, int]


class BrainAnalyzeResponse(BaseModel):
    analyses: Dict[str, FileAnalysisResponse]
    relationship_graph: Dict[str, List[str]]
    metrics: ProjectMetrics


@router.post("/analyze", summary="AI Brain Analysis - Smart file analysis with relationships")
async def brain_analyze(request: BrainAnalyzeRequest) -> BrainAnalyzeResponse:
    try:
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        result = await analyze_project_files(files_data)
        analyses = {}
        for path, data in result['analyses'].items():
            analyses[path] = FileAnalysisResponse(**data)
        return BrainAnalyzeResponse(
            analyses=analyses,
            relationship_graph=result['relationship_graph'],
            metrics=ProjectMetrics(**result['metrics'])
        )
    except Exception as e:
        logger.error(f"Brain analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/smart-descriptions", summary="Get smart descriptions for canvas nodes")
async def smart_descriptions(request: BrainAnalyzeRequest) -> Dict[str, Any]:
    try:
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        result = await analyze_project_files(files_data)
        descriptions = {}
        for path, analysis in result['analyses'].items():
            descriptions[path] = {
                'smart_description': analysis['purpose'],
                'file_type': analysis['file_type'],
                'language': analysis['language'],
                'complexity': analysis['complexity_score'],
                'line_count': analysis['line_count'],
            }
        return { 'descriptions': descriptions, 'metrics': result['metrics'] }
    except Exception as e:
        logger.error(f"Smart descriptions failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


class ChatRequest(BaseModel):
    question: str
    context: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    answer: str


@router.post("/chat", summary="Chat with AI about your project architecture")
async def brain_chat(request: ChatRequest) -> ChatResponse:
    settings = get_settings()
    api_key = os.environ.get('OPENROUTER_API_KEY') or settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key not configured.")

    ctx = request.context or {}
    files_list = ctx.get("files", [])
    file_contents = ctx.get("file_contents", [])
    analyses = ctx.get("analyses", {})
    metrics = ctx.get("metrics")
    graph = ctx.get("graph")
    framework = ctx.get("framework", "Python")
    project_name = ctx.get("project_name", "the project")

    context_parts = []

    if files_list:
        grouped: dict[str, list[str]] = {}
        for f in files_list:
            parts = f.split('/')
            folder = parts[0] if len(parts) > 1 else 'root'
            grouped.setdefault(folder, []).append(f)
        tree_lines = []
        for folder, folder_files in list(grouped.items())[:15]:
            tree_lines.append(f"  {folder}/")
            for ff in folder_files[:5]:
                tree_lines.append(f"    {ff}")
            if len(folder_files) > 5:
                tree_lines.append(f"    ... +{len(folder_files)-5} more")
        context_parts.append(f"Project: {project_name} ({framework})\nFile tree ({len(files_list)} total):\n" + "\n".join(tree_lines))

    if file_contents:
        snippets = []
        for fc in file_contents[:12]:
            path = fc.get("path", "")
            snippet = fc.get("snippet", "")
            if path and snippet:
                snippets.append(f"--- {path} ---\n{snippet[:1200]}")
        if snippets:
            context_parts.append("Key file contents:\n\n" + "\n\n".join(snippets))

    if analyses:
        analysis_lines = []
        for path, info in list(analyses.items())[:20]:
            purpose = info.get("purpose", "")
            funcs = ", ".join(info.get("functions", [])[:5])
            complexity = info.get("complexity_score", "?")
            analysis_lines.append(f"  {path}: {purpose} [complexity={complexity}]{f' | fns: {funcs}' if funcs else ''}")
        if analysis_lines:
            context_parts.append("File analysis:\n" + "\n".join(analysis_lines))

    if metrics:
        m = metrics
        context_parts.append(
            f"Metrics: {m.get('total_files','?')} files, {m.get('total_lines','?')} lines, "
            f"avg complexity {m.get('average_complexity','?'):.1f}. "
            f"Smells: {', '.join(m.get('architecture_smells', [])) or 'none'}."
            if isinstance(m.get('average_complexity'), float)
            else f"Metrics: {json.dumps(m, default=str)}"
        )

    if graph:
        edge_lines = []
        for src, targets in (graph if isinstance(graph, dict) else {}).items():
            for t in (targets if isinstance(targets, list) else []):
                edge_lines.append(f"  {src} → {t}")
        if edge_lines:
            context_parts.append("Dependency graph (top 40 edges):\n" + "\n".join(edge_lines[:40]))

    project_context_text = "\n\n".join(context_parts) if context_parts else "No runtime project context provided."
    markdown_context = markdown_knowledge_base.build_context(max_chars=5000) or "No markdown knowledge available."
    fallback_prompt = (
        "You are Archy AI, a principal backend architecture assistant for a repository visualization platform.\n\n"
        "Framework focus: {{FRAMEWORK}}\n\n"
        "Runtime project context:\n{{PROJECT_CONTEXT}}\n\n"
        "Repository architecture guidance:\n{{MARKDOWN_CONTEXT}}\n"
    )
    system_prompt = prompt_library.render(
        "brain_chat_system.md",
        {
            "FRAMEWORK": str(framework),
            "PROJECT_CONTEXT": project_context_text,
            "MARKDOWN_CONTEXT": markdown_context,
        },
        fallback=fallback_prompt,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": request.question},
    ]

    model = settings.available_models_list[0] if settings.available_models_list else "anthropic/claude-3.5-sonnet"

    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Archy",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "max_tokens": 1200,
                    "temperature": 0.4,
                },
                timeout=60.0,
            )
            if response.status_code != 200:
                    logger.error(f"OpenRouter chat error: {response.status_code} {response.text[:300]}")
                    if response.status_code in (401, 403):
                        raise HTTPException(status_code=401, detail="OpenRouter API key is invalid or missing.")
                    if response.status_code == 402:
                        raise HTTPException(status_code=402, detail="OpenRouter billing issue (Payment Required). Add credits or switch to a free model.")
                    if response.status_code == 404:
                        raise HTTPException(status_code=502, detail=f"Model not found on OpenRouter: {model}. Update AVAILABLE_MODELS in .env or select a valid model.")
                    if response.status_code == 429:
                        raise HTTPException(status_code=429, detail="OpenRouter rate limit reached. Wait a moment and retry.")
                    raise HTTPException(status_code=502, detail="AI service returned an error. Try again.")
            data = response.json()
            answer = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not answer:
                raise HTTPException(status_code=502, detail="AI returned an empty response.")
            return ChatResponse(answer=answer)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI service timed out. Try a shorter question.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Brain chat failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get AI response.")


class SecurityFile(BaseModel):
    path: str
    content: str

class SecurityScanRequest(BaseModel):
    files: List[SecurityFile]
    framework: Optional[str] = None

class SecurityFinding(BaseModel):
    severity: str
    category: str
    file: str
    line: Optional[int] = None
    description: str
    suggestion: str

class SecurityScanResponse(BaseModel):
    score: int
    findings: List[SecurityFinding]
    summary: str


@router.post("/security-scan", summary="AI-powered security analysis of project files")
async def security_scan(request: SecurityScanRequest) -> SecurityScanResponse:
    import re, httpx

    findings: List[SecurityFinding] = []

    secret_patterns = [
        (r'(?i)(password|passwd|secret|api_key|apikey|token|auth)\s*=\s*["\'][^"\']{4,}["\']', "Hardcoded credential"),
        (r'(?i)sk-[a-zA-Z0-9]{20,}', "Exposed API key (OpenAI/OpenRouter style)"),
        (r'(?i)(aws_access_key|aws_secret)\s*=\s*["\'][^"\']+["\']', "Hardcoded AWS credential"),
        (r'(?i)BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY', "Exposed private key"),
    ]
    unsafe_config_patterns = [
        (r'(?i)DEBUG\s*=\s*True', "Debug mode enabled in production config"),
        (r'(?i)allow_origins\s*=\s*\[?\s*["\']?\*["\']?\s*\]?', "CORS allows all origins"),
        (r'(?i)ALLOWED_HOSTS\s*=\s*\[?\s*["\']?\*["\']?\s*\]?', "Django ALLOWED_HOSTS allows all"),
        (r'(?i)verify\s*=\s*False', "SSL verification disabled"),
    ]
    injection_patterns = [
        (r'(?i)(execute|raw|cursor\.execute)\s*\(\s*f["\']', "Possible SQL injection via f-string"),
        (r'(?i)(execute|raw|cursor\.execute)\s*\(\s*["\'].*%s', "Possible SQL injection via string formatting"),
        (r'(?i)eval\s*\(', "Use of eval() — code injection risk"),
        (r'(?i)exec\s*\(', "Use of exec() — code injection risk"),
        (r'(?i)pickle\.loads?\s*\(', "Insecure deserialization with pickle"),
        (r'(?i)yaml\.load\s*\((?!.*Loader)', "Unsafe YAML loading (no Loader specified)"),
        (r'(?i)subprocess\.(call|run|Popen)\s*\(.*shell\s*=\s*True', "Shell injection risk"),
    ]

    for file_data in request.files:
        path = file_data.path
        content = file_data.content
        lines = content.split('\n')

        for pattern, desc in secret_patterns:
            for i, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    stripped = line.strip()
                    if stripped.startswith('#') or 'os.environ' in line or 'os.getenv' in line:
                        continue
                    findings.append(SecurityFinding(
                        severity="critical", category="Exposed Secret",
                        file=path, line=i, description=desc,
                        suggestion="Move to environment variables or a secrets manager."
                    ))

        for pattern, desc in unsafe_config_patterns:
            for i, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    if line.strip().startswith('#'):
                        continue
                    findings.append(SecurityFinding(
                        severity="high", category="Unsafe Configuration",
                        file=path, line=i, description=desc,
                        suggestion="Restrict to specific values for production deployments."
                    ))

        for pattern, desc in injection_patterns:
            for i, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    if line.strip().startswith('#'):
                        continue
                    findings.append(SecurityFinding(
                        severity="high", category="Injection Risk",
                        file=path, line=i, description=desc,
                        suggestion="Use parameterized queries or safe alternatives."
                    ))

        route_count = sum(1 for line in lines if re.search(r'@(app|router)\.(get|post|put|delete|patch)\s*\(', line))
        has_auth = any(re.search(r'(?i)(login_required|permission_required|Depends.*auth|IsAuthenticated|jwt_required|oauth2_scheme)', line) for line in lines)
        if route_count > 0 and not has_auth:
            findings.append(SecurityFinding(
                severity="medium", category="Missing Authentication",
                file=path, line=None,
                description=f"{route_count} route(s) found with no authentication decorator",
                suggestion="Add authentication middleware or per-route auth checks."
            ))

    severity_weights = {"critical": 20, "high": 10, "medium": 5, "low": 2, "info": 0}
    penalty = sum(severity_weights.get(f.severity, 0) for f in findings)
    score = max(0, min(100, 100 - penalty))

    crit = sum(1 for f in findings if f.severity == "critical")
    high = sum(1 for f in findings if f.severity == "high")
    med  = sum(1 for f in findings if f.severity == "medium")

    if crit > 0:
        base_summary = f"{crit} critical issue(s) detected. Immediate remediation required."
    elif high > 0:
        base_summary = f"{high} high-severity issue(s) found. Review recommended before deployment."
    elif med > 0:
        base_summary = f"{med} medium-severity issue(s). Generally stable but improvements advised."
    elif findings:
        base_summary = "Minor issues detected. Overall security posture is good."
    else:
        base_summary = "No security issues detected. Clean scan."

    settings = get_settings()
    api_key = os.environ.get('OPENROUTER_API_KEY') or settings.OPENROUTER_API_KEY
    ai_summary = base_summary

    if api_key and request.files:
        try:
            file_tree = "\n".join(f"  - {f.path}" for f in request.files[:30])
            findings_text = "\n".join(
                f"  [{f.severity.upper()}] {f.category} in {f.file}" + (f" (line {f.line})" if f.line else "") + f": {f.description}"
                for f in findings[:20]
            ) or "  No issues detected by static analysis."

            security_prompt = (
                f"You are a senior application security engineer reviewing a {request.framework or 'Python'} project.\n\n"
                f"Project files scanned ({len(request.files)} total):\n{file_tree}\n\n"
                f"Static analysis findings:\n{findings_text}\n\n"
                f"Security score: {score}/100\n\n"
                "Provide a concise professional security assessment (3-4 sentences) covering:\n"
                "1. Overall risk level and most critical concerns\n"
                "2. Specific recommendations for the identified issues\n"
                "3. Best practices for this framework/stack\n"
                "Be direct, developer-focused, and actionable. No bullet points, just clear prose."
            )

            model = settings.AVAILABLE_MODELS.split(",")[0].strip()
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "Archy Security Scanner",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": "You are a security-focused code reviewer. Be concise and actionable."},
                            {"role": "user", "content": security_prompt},
                        ],
                        "stream": False,
                        "max_tokens": 300,
                    },
                    timeout=30.0,
                )
                if response.status_code == 200:
                    data = response.json()
                    ai_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if ai_text:
                        ai_summary = ai_text
        except Exception as e:
            logger.warning(f"AI security summary failed, using static summary: {e}")

    return SecurityScanResponse(score=score, findings=findings, summary=ai_summary)
