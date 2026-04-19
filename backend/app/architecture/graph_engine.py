from __future__ import annotations

from typing import Any, Dict, List, Optional

from .framework_detector import FrameworkDetector
from .parser_layer import PythonAstParserLayer


class ArchitectureGraphEngine:
    def __init__(
        self,
        parser_layer: Optional[PythonAstParserLayer] = None,
        framework_detector: Optional[FrameworkDetector] = None,
    ):
        self.parser_layer = parser_layer or PythonAstParserLayer()
        self.framework_detector = framework_detector or FrameworkDetector()

    def analyze_project(
        self,
        files: List[Dict[str, str]],
        exclude_migrations: bool = True,
    ) -> Dict[str, Any]:
        graph = self.parser_layer.parse_project(files, exclude_migrations=exclude_migrations)
        detection = self.framework_detector.detect(files)
        graph["framework_detection"] = {
            "framework": detection.framework,
            "confidence": detection.confidence,
            "runner_up": detection.runner_up,
            "scores": detection.scores,
            "signals": detection.signals,
        }
        graph["layer_profile"] = self._layer_profile(graph.get("nodes", []))
        return graph

    def _layer_profile(self, nodes: List[Dict[str, Any]]) -> Dict[str, int]:
        profile: Dict[str, int] = {
            "entry": 0,
            "interface": 0,
            "domain": 0,
            "infrastructure": 0,
            "data": 0,
        }
        type_map = {
            "app": "entry",
            "route": "interface",
            "controller": "interface",
            "service": "domain",
            "domain": "domain",
            "repository": "infrastructure",
            "diContainer": "infrastructure",
            "schema": "data",
            "model": "data",
        }

        for node in nodes:
            node_type = node.get("type", "")
            layer = type_map.get(node_type)
            if layer:
                profile[layer] += 1

        return profile
