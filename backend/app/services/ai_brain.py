import httpx
import json
import os
from typing import Dict, List, Any, Optional
from ..config import get_settings
from .prompt_library import prompt_library
from .markdown_knowledge import markdown_knowledge_base


class FileAnalysis:
    def __init__(self, path: str, content: str):
        self.path = path
        self.content = content
        self.file_type = self._detect_file_type()
        self.language = self._detect_language()
        self.purpose = ""
        self.functions: List[str] = []
        self.imports: List[str] = []
        self.exports: List[str] = []
        self.complexity_score = 0
        self.line_count = len(content.split('\n'))
        self.relationships: List[Dict[str, Any]] = []

    def _detect_file_type(self) -> str:
        ext = self.path.split('.')[-1].lower() if '.' in self.path else ''
        type_map = {
            'py': 'python', 'js': 'javascript', 'ts': 'typescript',
            'jsx': 'react', 'tsx': 'react-ts', 'json': 'json',
            'css': 'stylesheet', 'scss': 'stylesheet', 'html': 'markup',
            'svg': 'vector', 'png': 'image', 'jpg': 'image',
            'md': 'markdown', 'txt': 'text',
        }
        return type_map.get(ext, 'unknown')

    def _detect_language(self) -> str:
        ext = self.path.split('.')[-1].lower() if '.' in self.path else ''
        lang_map = {
            'py': 'Python', 'js': 'JavaScript', 'ts': 'TypeScript',
            'jsx': 'JavaScript', 'tsx': 'TypeScript', 'json': 'JSON',
            'css': 'CSS', 'scss': 'SCSS', 'html': 'HTML', 'md': 'Markdown',
        }
        return lang_map.get(ext, 'Unknown')


class AIBrain:
    def __init__(self):
        self.analyses: Dict[str, FileAnalysis] = {}
        self.relationship_graph: Dict[str, List[str]] = {}

    async def analyze_files(self, files_data: List[Dict[str, str]]) -> Dict[str, Any]:
        for file_data in files_data:
            path = file_data.get('path', '')
            content = file_data.get('content', '')
            if path and content:
                self.analyses[path] = FileAnalysis(path, content)

        await self._enrich_with_ai()
        self._build_relationships()
        metrics = self._calculate_metrics()

        return {
            'analyses': {
                path: {
                    'path': path,
                    'file_type': analysis.file_type,
                    'language': analysis.language,
                    'purpose': analysis.purpose,
                    'functions': analysis.functions[:10],
                    'imports': analysis.imports[:10],
                    'line_count': analysis.line_count,
                    'complexity_score': analysis.complexity_score,
                    'relationships': analysis.relationships,
                }
                for path, analysis in self.analyses.items()
            },
            'relationship_graph': self.relationship_graph,
            'metrics': metrics,
        }

    async def _enrich_with_ai(self):
        batch_size = 5
        analysis_list = list(self.analyses.items())
        for i in range(0, len(analysis_list), batch_size):
            batch = analysis_list[i:i + batch_size]
            await self._analyze_batch(batch)

    async def _analyze_batch(self, batch: List[tuple]):
        prompt = self._build_analysis_prompt(batch)
        api_key = os.environ.get('OPENROUTER_API_KEY') or get_settings().OPENROUTER_API_KEY
        if not api_key:
            for _, analysis in batch:
                analysis.purpose = f"{analysis.language} file with {analysis.line_count} lines"
                analysis.complexity_score = min(10, analysis.line_count // 50)
            return
        model_name = (
            get_settings().available_models_list[0]
            if get_settings().available_models_list
            else 'anthropic/claude-3.5-sonnet'
        )
        async with httpx.AsyncClient() as client:
            try:
                settings = get_settings()
                response = await client.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "Archy",
                    },
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                    },
                    timeout=60.0,
                )
                if response.status_code == 200:
                    data = response.json()
                    content = data['choices'][0]['message']['content']
                    self._parse_ai_response(content, batch)
            except Exception as e:
                print(f"AI analysis error: {e}")
                for path, analysis in batch:
                    analysis.purpose = f"{analysis.language} file with {analysis.line_count} lines"
                    analysis.complexity_score = min(10, analysis.line_count // 50)

    def _build_analysis_prompt(self, batch: List[tuple]) -> str:
        files_block = ""
        for path, analysis in batch:
            content_preview = analysis.content[:2000] + "..." if len(analysis.content) > 2000 else analysis.content
            files_block += f"\n--- {path} ---\n{content_preview}\n"
        markdown_context = markdown_knowledge_base.build_context(max_chars=3000) or ""
        fallback = "Analyze the files and return strict JSON by file path.\n{{FILES_BLOCK}}"
        return prompt_library.render(
            "brain_batch_analysis.md",
            {
                "MARKDOWN_CONTEXT": markdown_context,
                "FILES_BLOCK": files_block,
            },
            fallback=fallback,
        )

    def _parse_ai_response(self, content: str, batch: List[tuple]):
        try:
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                data = json.loads(content[json_start:json_end])
                for path, analysis in batch:
                    if path in data:
                        fd = data[path]
                        analysis.purpose = fd.get('purpose', 'No description available')
                        analysis.functions = fd.get('functions', [])
                        analysis.imports = fd.get('imports', [])
                        analysis.complexity_score = fd.get('complexity_score', 5)
                    else:
                        analysis.purpose = f"{analysis.language} file with {analysis.line_count} lines"
                        analysis.complexity_score = min(10, analysis.line_count // 50)
        except json.JSONDecodeError:
            for path, analysis in batch:
                analysis.purpose = f"{analysis.language} file with {analysis.line_count} lines"
                analysis.complexity_score = min(10, analysis.line_count // 50)

    def _build_relationships(self):
        for path, analysis in self.analyses.items():
            self.relationship_graph[path] = []
            for other_path in self.analyses:
                if path != other_path:
                    other_name = other_path.split('/')[-1].replace('.py', '').replace('.js', '')
                    for imp in analysis.imports:
                        if other_name in imp or other_path in imp:
                            self.relationship_graph[path].append(other_path)
                            analysis.relationships.append({
                                'target': other_path,
                                'type': 'imports',
                                'strength': 1,
                            })
                            break

    def _calculate_metrics(self) -> Dict[str, Any]:
        total_lines = sum(a.line_count for a in self.analyses.values())
        total_files = len(self.analyses)
        avg_complexity = sum(a.complexity_score for a in self.analyses.values()) / max(1, total_files)
        lang_dist: Dict[str, int] = {}
        for a in self.analyses.values():
            lang_dist[a.language] = lang_dist.get(a.language, 0) + 1
        type_dist: Dict[str, int] = {}
        for a in self.analyses.values():
            type_dist[a.file_type] = type_dist.get(a.file_type, 0) + 1
        return {
            'total_files': total_files,
            'total_lines': total_lines,
            'average_complexity': round(avg_complexity, 2),
            'language_distribution': lang_dist,
            'type_distribution': type_dist,
        }


ai_brain = AIBrain()


async def analyze_project_files(files_data: List[Dict[str, str]]) -> Dict[str, Any]:
    brain = AIBrain()
    return await brain.analyze_files(files_data)
