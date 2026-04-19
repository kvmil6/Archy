from __future__ import annotations

from typing import Any, Dict, List

from ..architecture.graph_engine import ArchitectureGraphEngine


class ArchitectureService:
    def __init__(self):
        self._engine = ArchitectureGraphEngine()

    def analyze_project(
        self,
        files: List[Dict[str, str]],
        exclude_migrations: bool = True,
    ) -> Dict[str, Any]:
        normalized = [
            {
                "path": f.get("path", ""),
                "content": f.get("content", ""),
            }
            for f in files
            if f.get("path", "").endswith(".py") and f.get("content")
        ]
        return self._engine.analyze_project(
            normalized,
            exclude_migrations=exclude_migrations,
        )

    def detect_framework(self, files: List[Dict[str, str]]) -> Dict[str, Any]:
        normalized = [
            {
                "path": f.get("path", ""),
                "content": f.get("content", ""),
            }
            for f in files
            if f.get("path", "") and f.get("content") is not None
        ]
        detection = self._engine.framework_detector.detect(normalized)
        return {
            "framework": detection.framework,
            "confidence": detection.confidence,
            "runner_up": detection.runner_up,
            "scores": detection.scores,
            "signals": detection.signals,
        }


architecture_service = ArchitectureService()
