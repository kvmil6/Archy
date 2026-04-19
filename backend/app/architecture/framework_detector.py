from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .framework_plugins import DetectionSignal, FrameworkPlugin, default_framework_plugins


@dataclass
class FrameworkDetectionResult:
    framework: str
    confidence: float
    runner_up: Optional[str]
    scores: Dict[str, int]
    signals: List[str]


class FrameworkDetector:
    def __init__(self, plugins: Optional[List[FrameworkPlugin]] = None):
        self._plugins: List[FrameworkPlugin] = plugins or default_framework_plugins()

    def register_plugin(self, plugin: FrameworkPlugin) -> None:
        self._plugins.append(plugin)

    def detect(self, files: List[Dict[str, str]]) -> FrameworkDetectionResult:
        collected: List[DetectionSignal] = []
        for plugin in self._plugins:
            collected.extend(plugin.detect(files))

        scores: Dict[str, int] = {}
        for signal in collected:
            scores[signal.framework] = scores.get(signal.framework, 0) + signal.score

        if not scores:
            return FrameworkDetectionResult(
                framework="unknown",
                confidence=0.0,
                runner_up=None,
                scores={},
                signals=[],
            )

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        framework, winner_score = ranked[0]
        runner_up = ranked[1][0] if len(ranked) > 1 else None
        total = max(sum(scores.values()), 1)
        confidence = round(winner_score / total, 3)

        ordered_signals = [
            f"{signal.framework}: {signal.reason} (+{signal.score})"
            for signal in sorted(collected, key=lambda s: s.score, reverse=True)
            if signal.framework == framework
        ][:8]

        return FrameworkDetectionResult(
            framework=framework,
            confidence=confidence,
            runner_up=runner_up,
            scores=scores,
            signals=ordered_signals,
        )
