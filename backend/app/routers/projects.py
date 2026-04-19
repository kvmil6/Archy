"""
Projects Router - Project analysis and structure endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from pathlib import Path
import re
from ..services.project_analyzer import analyze_project_structure
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])
_EXAMPLE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _get_examples_root() -> Path:
    return (Path(__file__).resolve().parent.parent.parent.parent / "examples").resolve()


def _resolve_example_project_dir(name: str) -> Path:
    if not _EXAMPLE_NAME_RE.fullmatch(name):
        raise HTTPException(status_code=400, detail="Invalid example project name")

    examples_dir = _get_examples_root()
    project_dir = (examples_dir / name).resolve()

    try:
        project_dir.relative_to(examples_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid example project path") from exc

    if not project_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Example project '{name}' not found")

    return project_dir


class FileContent(BaseModel):
    path: str
    content: str


class AnalyzeRequest(BaseModel):
    files: List[FileContent]
    project_name: Optional[str] = "project"


class FrameworkInfo(BaseModel):
    framework: str
    confidence: float
    apps: List[str]
    main_files: List[str]
    entry_points: List[str]
    config_files: List[str]
    detected_patterns: List[str]


class ProjectAnalysisResponse(BaseModel):
    framework: FrameworkInfo
    total_files: int
    file_analyses: Dict[str, Any]
    recommendations: List[str]


@router.post("/analyze", summary="Analyze project structure and framework")
async def analyze_project(request: AnalyzeRequest) -> ProjectAnalysisResponse:
    """
    Analyzes a Python project to detect:
    - Framework (Django/FastAPI/Flask)
    - Project structure (apps, entry points, config files)
    - File-level analysis (imports, classes, functions, complexity)
    - Architecture recommendations
    """
    try:
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        
        result = await analyze_project_structure(files_data)
        
        # Generate recommendations based on analysis
        recommendations = generate_recommendations(result)
        
        return ProjectAnalysisResponse(
            framework=FrameworkInfo(
                framework=result['framework'],
                confidence=result['confidence'],
                apps=result['apps'],
                main_files=result['main_files'],
                entry_points=result['entry_points'],
                config_files=result['config_files'],
                detected_patterns=result['detected_patterns'],
            ),
            total_files=result['total_files'],
            file_analyses=result['file_analyses'],
            recommendations=recommendations,
        )
        
    except Exception as e:
        logger.error(f"Project analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/detect-framework", summary="Quick framework detection")
async def detect_framework(request: AnalyzeRequest) -> Dict[str, Any]:
    """
    Quick endpoint to detect project framework without full analysis.
    """
    try:
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        
        result = await analyze_project_structure(files_data)
        
        return {
            "framework": result['framework'],
            "confidence": result['confidence'],
            "apps_count": len(result['apps']),
            "files_count": result['total_files'],
            "main_files": result['main_files'],
        }
        
    except Exception as e:
        logger.error(f"Framework detection failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


def generate_recommendations(analysis: Dict[str, Any]) -> List[str]:
    """Generate architecture recommendations based on analysis"""
    recommendations = []
    
    framework = analysis.get('framework', 'unknown')
    apps = analysis.get('apps', [])
    total_files = analysis.get('total_files', 0)
    file_analyses = analysis.get('file_analyses', {})
    
    # Framework-specific recommendations
    if framework == 'django':
        if 'urls.py' not in [f.split('/')[-1] for f in file_analyses.keys()]:
            recommendations.append("Consider adding URL routing configuration")
        
        if not any('models' in f for f in file_analyses.keys()):
            recommendations.append("No models detected - consider adding database models")
        
        if len(apps) < 2 and total_files > 20:
            recommendations.append("Consider splitting functionality into separate Django apps")
    
    elif framework == 'fastapi':
        if not any('pydantic' in str(f.get('imports', [])) for f in file_analyses.values()):
            recommendations.append("Consider using Pydantic models for request/response validation")
        
        if not any('router' in f for f in file_analyses.keys()):
            recommendations.append("Consider organizing routes using APIRouter")
    
    elif framework == 'flask':
        if not any('config' in f for f in file_analyses.keys()):
            recommendations.append("Consider adding a configuration file")
        
        if len(apps) == 0 and total_files > 10:
            recommendations.append("Consider using Flask blueprints for modularity")
    
    # General recommendations
    high_complexity = [
        path for path, data in file_analyses.items() 
        if data.get('complexity', 0) > 7
    ]
    if high_complexity:
        recommendations.append(
            f"{len(high_complexity)} files have high complexity - consider refactoring: {', '.join(high_complexity[:3])}"
        )
    
    if total_files > 50:
        recommendations.append("Large project - consider adding comprehensive documentation")
    
    return recommendations


@router.get("/examples", summary="List bundled example projects")
async def list_example_projects():
    examples_dir = _get_examples_root()
    if not examples_dir.is_dir():
        return {"projects": []}

    projects = []
    for child in sorted(examples_dir.iterdir()):
        if not child.is_dir():
            continue
        # Scan .py files recursively
        py_files = []
        for f in child.rglob("*.py"):
            py_files.append(str(f.relative_to(child)).replace("\\", "/"))
        if py_files:
            projects.append({
                "name": child.name,
                "path": str(child),
                "files": sorted(py_files),
            })
    return {"projects": projects}


@router.get("/examples/{name}/files", summary="Read all files from an example project")
async def read_example_project(name: str):
    project_dir = _resolve_example_project_dir(name)

    files = []
    for f in sorted(project_dir.rglob("*.py")):
        rel = str(f.relative_to(project_dir)).replace("\\", "/")
        try:
            content = f.read_text(encoding="utf-8")
        except Exception:
            content = ""
        files.append({"path": rel, "content": content})
    return {"name": name, "path": str(project_dir), "files": files}
