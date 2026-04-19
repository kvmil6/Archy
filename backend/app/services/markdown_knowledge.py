from __future__ import annotations

from pathlib import Path
from typing import List


class MarkdownKnowledgeBase:
    def __init__(self):
        self._repo_root = Path(__file__).resolve().parents[3]

    def _candidates(self) -> List[Path]:
        return [
            self._repo_root / "README.md",
            self._repo_root / "frontend" / "README.md",
            self._repo_root / "docs" / "ARCHITECTURE.md",
            self._repo_root / ".claude" / "Claude.md",
            self._repo_root / ".claude" / "backend.md",
            self._repo_root / ".claude" / "frontend.md",
            self._repo_root / "CONTRIBUTING.md",
        ]

    def build_context(self, max_chars: int = 9000) -> str:
        chunks: List[str] = []
        for path in self._candidates():
            if not path.exists():
                continue
            content = path.read_text(encoding="utf-8")
            selected = self._select_lines(content)
            if selected:
                chunks.append(f"[{path.relative_to(self._repo_root)}]\n{selected}")

        merged = "\n\n".join(chunks)
        if len(merged) <= max_chars:
            return merged
        return merged[:max_chars]

    def _select_lines(self, content: str) -> str:
        lines = content.splitlines()
        picked: List[str] = []
        for line in lines:
            s = line.strip()
            if not s:
                continue
            if s.startswith("#") or s.startswith("-") or s.startswith("|"):
                picked.append(line)
            elif len(picked) < 40:
                picked.append(line)
            if len(picked) >= 140:
                break
        return "\n".join(picked)


markdown_knowledge_base = MarkdownKnowledgeBase()
