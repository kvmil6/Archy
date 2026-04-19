"""
Project Analyzer Service - Framework detection and intelligent project analysis
"""
import os
import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class FrameworkType(Enum):
    DJANGO = "django"
    FASTAPI = "fastapi"
    FLASK = "flask"
    UNKNOWN = "unknown"


@dataclass
class ProjectStructure:
    framework: FrameworkType
    confidence: float
    apps: List[str]
    main_files: List[str]
    entry_points: List[str]
    config_files: List[str]
    detected_patterns: List[str]


@dataclass
class FileAnalysis:
    path: str
    content: str
    imports: List[str]
    classes: List[str]
    functions: List[str]
    decorators: List[str]
    complexity_score: int


class ProjectAnalyzer:
    """
    Analyzes Python projects to detect framework and extract architecture.
    """
    
    FRAMEWORK_SIGNATURES = {
        FrameworkType.DJANGO: {
            'files': ['manage.py', 'settings.py', 'wsgi.py', 'asgi.py', 'urls.py'],
            'imports': ['django', 'rest_framework'],
            'patterns': [
                r'from django\.', r'from rest_framework\.', 
                r'class.*models\.Model', r'@register\(',
                r'urlpatterns\s*=\s*\[', r'path\([^)]+\)',
            ],
            'weight': 2.0,
        },
        FrameworkType.FASTAPI: {
            'files': ['main.py', 'app.py'],
            'imports': ['fastapi', 'starlette', 'pydantic'],
            'patterns': [
                r'from fastapi\s+import', r'FastAPI\s*\(',
                r'@app\.get\(', r'@app\.post\(', r'@app\.put\(', r'@app\.delete\(',
                r'BaseModel', r'pydantic',
            ],
            'weight': 2.0,
        },
        FrameworkType.FLASK: {
            'files': ['app.py', 'wsgi.py'],
            'imports': ['flask', 'flask_restful', 'flask_sqlalchemy'],
            'patterns': [
                r'from flask\s+import', r'Flask\s*\(__name__\)',
                r'@app\.route\(', r'register_blueprint',
            ],
            'weight': 2.0,
        },
    }
    
    def __init__(self):
        self.files: Dict[str, str] = {}
        self.analysis_cache: Dict[str, FileAnalysis] = {}
    
    def load_files(self, files_data: List[Dict[str, str]]):
        """Load files into analyzer"""
        for file_data in files_data:
            path = file_data.get('path', '')
            content = file_data.get('content', '')
            if path and content:
                self.files[path] = content
    
    def detect_framework(self) -> ProjectStructure:
        """Detect project framework based on files and patterns"""
        scores = {ft: 0.0 for ft in FrameworkType}
        detected_patterns = []
        
        for framework, signature in self.FRAMEWORK_SIGNATURES.items():
            score = 0.0
            found_patterns = []
            
            # Check for signature files
            for sig_file in signature['files']:
                matching_files = [f for f in self.files.keys() if f.endswith(sig_file)]
                if matching_files:
                    score += signature['weight']
                    found_patterns.append(f"file:{sig_file}")
            
            # Check for imports and patterns in file contents
            for path, content in self.files.items():
                # Check imports
                for imp in signature['imports']:
                    if f'import {imp}' in content or f'from {imp}' in content:
                        score += 0.5
                        found_patterns.append(f"import:{imp}")
                
                # Check patterns
                for pattern in signature['patterns']:
                    if re.search(pattern, content):
                        score += 0.3
                        found_patterns.append(f"pattern:{pattern[:30]}...")
            
            scores[framework] = score
            if score > 0:
                detected_patterns.extend(found_patterns)
        
        # Determine winner
        max_framework = max(scores, key=scores.get)
        max_score = scores[max_framework]
        total_score = sum(scores.values()) or 1
        confidence = max_score / total_score if total_score > 0 else 0
        
        # Extract additional structure
        apps = self._extract_apps(max_framework)
        main_files = self._find_main_files(max_framework)
        entry_points = self._find_entry_points(max_framework)
        config_files = self._find_config_files(max_framework)
        
        return ProjectStructure(
            framework=max_framework,
            confidence=min(confidence, 1.0),
            apps=apps,
            main_files=main_files,
            entry_points=entry_points,
            config_files=config_files,
            detected_patterns=list(set(detected_patterns))[:10]  # Top 10 unique
        )
    
    def _extract_apps(self, framework: FrameworkType) -> List[str]:
        """Extract Django/FastAPI apps or Flask blueprints"""
        apps = set()
        
        if framework == FrameworkType.DJANGO:
            # Django apps are top-level directories with models.py or apps.py
            for path in self.files.keys():
                parts = path.split('/')
                if len(parts) >= 2:
                    app_name = parts[0]
                    if any(path.startswith(f"{app_name}/") and f.endswith(('.py',))
                       for f in self.files.keys() if f.startswith(app_name)):
                        apps.add(app_name)
        
        elif framework == FrameworkType.FASTAPI:
            # FastAPI routers or modules
            for path in self.files.keys():
                if 'router' in path.lower() or path.endswith('routes.py'):
                    parts = path.split('/')
                    if len(parts) >= 2:
                        apps.add(parts[0])
        
        elif framework == FrameworkType.FLASK:
            # Flask blueprints
            for path, content in self.files.items():
                if 'Blueprint' in content:
                    parts = path.split('/')
                    if len(parts) >= 2:
                        apps.add(parts[0])
        
        return sorted(list(apps))
    
    def _find_main_files(self, framework: FrameworkType) -> List[str]:
        """Find main application files"""
        candidates = []
        
        if framework == FrameworkType.DJANGO:
            candidates = ['manage.py', 'urls.py', 'wsgi.py', 'asgi.py']
        elif framework == FrameworkType.FASTAPI:
            candidates = ['main.py', 'app.py', 'api.py']
        elif framework == FrameworkType.FLASK:
            candidates = ['app.py', 'wsgi.py', 'application.py']
        
        found = []
        for candidate in candidates:
            matching = [f for f in self.files.keys() if f.endswith(candidate)]
            found.extend(matching)
        
        return found
    
    def _find_entry_points(self, framework: FrameworkType) -> List[str]:
        """Find application entry points"""
        entry_points = []
        
        for path, content in self.files.items():
            # Look for common entry point patterns
            if framework == FrameworkType.DJANGO:
                if 'execute_from_command_line' in content or '__main__' in content:
                    entry_points.append(path)
            elif framework == FrameworkType.FASTAPI:
                if 'uvicorn.run' in content or '__main__' in content:
                    entry_points.append(path)
            elif framework == FrameworkType.FLASK:
                if 'app.run(' in content or '__main__' in content:
                    entry_points.append(path)
        
        return entry_points
    
    def _find_config_files(self, framework: FrameworkType) -> List[str]:
        """Find configuration files"""
        config_files = []
        
        if framework == FrameworkType.DJANGO:
            config_patterns = ['settings.py', 'local_settings.py', 'config.py']
        elif framework == FrameworkType.FASTAPI:
            config_patterns = ['config.py', 'settings.py', '.env']
        elif framework == FrameworkType.FLASK:
            config_patterns = ['config.py', 'settings.py', '.env']
        else:
            config_patterns = ['config.py', 'settings.py']
        
        for pattern in config_patterns:
            matching = [f for f in self.files.keys() if pattern in f]
            config_files.extend(matching)
        
        return config_files
    
    def analyze_file(self, path: str) -> Optional[FileAnalysis]:
        """Analyze a single file"""
        if path not in self.files:
            return None
        
        if path in self.analysis_cache:
            return self.analysis_cache[path]
        
        content = self.files[path]
        
        # Extract imports
        imports = re.findall(r'^(?:from|import)\s+(\S+)', content, re.MULTILINE)
        
        # Extract classes
        classes = re.findall(r'^class\s+(\w+)', content, re.MULTILINE)
        
        # Extract functions
        functions = re.findall(r'^def\s+(\w+)', content, re.MULTILINE)
        
        # Extract decorators
        decorators = re.findall(r'^@(\w+)', content, re.MULTILINE)
        
        # Calculate complexity score
        lines = content.split('\n')
        complexity = len([l for l in lines if l.strip()]) // 20  # 1 point per 20 lines
        complexity += len(classes) * 2  # Classes add complexity
        complexity += len(functions) // 5  # Many functions add complexity
        complexity = min(complexity, 10)  # Cap at 10
        
        analysis = FileAnalysis(
            path=path,
            content=content,
            imports=imports[:20],  # Top 20 imports
            classes=classes,
            functions=functions,
            decorators=decorators,
            complexity_score=complexity
        )
        
        self.analysis_cache[path] = analysis
        return analysis
    
    def get_architecture_summary(self) -> Dict[str, Any]:
        """Get complete architecture summary"""
        structure = self.detect_framework()
        
        # Analyze all files
        file_analyses = {}
        for path in self.files.keys():
            analysis = self.analyze_file(path)
            if analysis:
                file_analyses[path] = {
                    'imports': analysis.imports,
                    'classes': analysis.classes,
                    'functions': analysis.functions[:10],
                    'decorators': analysis.decorators,
                    'complexity': analysis.complexity_score,
                }
        
        return {
            'framework': structure.framework.value,
            'confidence': structure.confidence,
            'apps': structure.apps,
            'main_files': structure.main_files,
            'entry_points': structure.entry_points,
            'config_files': structure.config_files,
            'detected_patterns': structure.detected_patterns,
            'total_files': len(self.files),
            'file_analyses': file_analyses,
        }


# Singleton instance
project_analyzer = ProjectAnalyzer()


async def analyze_project_structure(files_data: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Main entry point for project analysis
    
    Args:
        files_data: List of dicts with 'path' and 'content' keys
        
    Returns:
        Complete project architecture analysis
    """
    analyzer = ProjectAnalyzer()
    analyzer.load_files(files_data)
    return analyzer.get_architecture_summary()
