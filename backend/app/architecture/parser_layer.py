from __future__ import annotations

from typing import Any, Dict, List

from ..services.python_parser import build_project_graph


class PythonAstParserLayer:
    def parse_project(
        self,
        files: List[Dict[str, str]],
        exclude_migrations: bool = True,
    ) -> Dict[str, Any]:
        return build_project_graph(files, exclude_migrations=exclude_migrations)
