from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional


class PromptLibrary:
    def __init__(self):
        self._root = Path(__file__).resolve().parent.parent / "prompts"

    def load(self, name: str) -> Optional[str]:
        path = self._root / name
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def render(self, name: str, values: Dict[str, str], fallback: str = "") -> str:
        template = self.load(name) or fallback
        rendered = template
        for key, value in values.items():
            rendered = rendered.replace(f"{{{{{key}}}}}", value)
        return rendered


prompt_library = PromptLibrary()
