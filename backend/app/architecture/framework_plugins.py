from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Protocol


@dataclass(frozen=True)
class DetectionSignal:
    framework: str
    plugin: str
    score: int
    reason: str


class FrameworkPlugin(Protocol):
    name: str

    def detect(self, files: List[Dict[str, str]]) -> List[DetectionSignal]:
        ...


class DjangoPlugin:
    name = "django"

    def detect(self, files: List[Dict[str, str]]) -> List[DetectionSignal]:
        signals: List[DetectionSignal] = []
        path_set = {f.get("path", "").lower().replace("\\", "/") for f in files}
        content = "\n".join(f.get("content", "")[:1600] for f in files[:30]).lower()

        if any(p.endswith("manage.py") for p in path_set):
            signals.append(DetectionSignal("django", self.name, 100, "manage.py detected"))
        if any("/migrations/" in p for p in path_set):
            signals.append(DetectionSignal("django", self.name, 45, "migrations package detected"))
        if any(p.endswith("settings.py") for p in path_set):
            signals.append(DetectionSignal("django", self.name, 55, "settings.py detected"))
        if "installed_apps" in content:
            signals.append(DetectionSignal("django", self.name, 80, "INSTALLED_APPS detected"))
        if "from django" in content or "import django" in content:
            signals.append(DetectionSignal("django", self.name, 65, "Django imports detected"))

        return signals


class FastAPIPlugin:
    name = "fastapi"

    def detect(self, files: List[Dict[str, str]]) -> List[DetectionSignal]:
        signals: List[DetectionSignal] = []
        path_set = {f.get("path", "").lower().replace("\\", "/") for f in files}
        content = "\n".join(f.get("content", "")[:1600] for f in files[:30])
        lower_content = content.lower()

        if any("/routers/" in p for p in path_set):
            signals.append(DetectionSignal("fastapi", self.name, 35, "routers package detected"))
        if "from fastapi import" in lower_content or "import fastapi" in lower_content:
            signals.append(DetectionSignal("fastapi", self.name, 95, "FastAPI imports detected"))
        if "fastapi(" in lower_content:
            signals.append(DetectionSignal("fastapi", self.name, 90, "FastAPI app instantiation detected"))
        if "uvicorn" in lower_content:
            signals.append(DetectionSignal("fastapi", self.name, 35, "Uvicorn runtime hints detected"))

        return signals


class FlaskPlugin:
    name = "flask"

    def detect(self, files: List[Dict[str, str]]) -> List[DetectionSignal]:
        signals: List[DetectionSignal] = []
        content = "\n".join(f.get("content", "")[:1600] for f in files[:30]).lower()

        if "from flask import" in content or "import flask" in content:
            signals.append(DetectionSignal("flask", self.name, 95, "Flask imports detected"))
        if "flask(__name__)" in content or "app = flask(" in content:
            signals.append(DetectionSignal("flask", self.name, 90, "Flask app instantiation detected"))
        if "blueprint(" in content:
            signals.append(DetectionSignal("flask", self.name, 40, "Blueprint usage detected"))

        return signals


def default_framework_plugins() -> List[FrameworkPlugin]:
    return [DjangoPlugin(), FastAPIPlugin(), FlaskPlugin()]
