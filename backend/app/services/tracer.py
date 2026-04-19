"""
Part 7A — Runtime Tracing via sys.settrace.

Only traces files inside the user's project directory.
Records: file path, function name, call count, total time (ms).
Writes trace data to .archy_cache/trace.json every 5 seconds.
Zero impact when not explicitly enabled.
"""
import sys
import json
import time
import threading
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

TRACE_FILE = Path(".archy_cache") / "trace.json"


class RuntimeTracer:
    """Lightweight sys.settrace-based tracer."""

    def __init__(self):
        self._enabled = False
        self._project_dir: str = ""
        self._data: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._flush_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        # Call timing stacks per thread
        self._call_stacks: dict[int, list[tuple[str, float]]] = {}

    @property
    def enabled(self) -> bool:
        return self._enabled

    def start(self, project_dir: str) -> dict:
        """Enable tracing for files inside project_dir."""
        if self._enabled:
            return {"status": "already_running"}

        self._project_dir = str(Path(project_dir).resolve())
        self._data = {}
        self._call_stacks = {}
        self._enabled = True
        self._stop_event.clear()

        sys.settrace(self._trace_calls)
        threading.settrace(self._trace_calls)

        # Start periodic flush
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

        logger.info("Tracing started for %s", self._project_dir)
        return {"status": "started", "project_dir": self._project_dir}

    def stop(self) -> dict:
        """Disable tracing and return summary."""
        if not self._enabled:
            return {"status": "not_running"}

        self._enabled = False
        sys.settrace(None)
        threading.settrace(None)
        self._stop_event.set()

        summary = self._get_summary()
        self._flush_to_disk()

        logger.info("Tracing stopped. %d functions traced.", len(self._data))
        return {"status": "stopped", "summary": summary}

    def get_current(self) -> dict:
        """Return current trace data."""
        return self._get_summary()

    def import_otel(self, spans: list[dict]) -> dict:
        """Import OpenTelemetry trace spans and map to function data."""
        imported = 0
        with self._lock:
            for span in spans:
                name = span.get("name", "")
                if not name:
                    continue
                duration_ns = span.get("endTimeUnixNano", 0) - span.get("startTimeUnixNano", 0)
                duration_ms = duration_ns / 1_000_000

                # Try to extract file info from attributes
                attrs = {}
                for attr in span.get("attributes", []):
                    attrs[attr.get("key", "")] = attr.get("value", {}).get("stringValue", "")

                filepath = attrs.get("code.filepath", name)
                func_name = attrs.get("code.function", name)
                key = f"{filepath}::{func_name}"

                if key not in self._data:
                    self._data[key] = {
                        "file": filepath,
                        "function": func_name,
                        "call_count": 0,
                        "total_ms": 0.0,
                    }
                self._data[key]["call_count"] += 1
                self._data[key]["total_ms"] += duration_ms
                imported += 1

        self._flush_to_disk()
        return {"imported": imported, "total_functions": len(self._data)}

    # ── Internal ─────────────────────────────────────────────────────

    def _trace_calls(self, frame, event, arg):
        """sys.settrace callback — only traces project files."""
        if not self._enabled:
            return None

        filename = frame.f_code.co_filename
        if not filename.startswith(self._project_dir):
            return None

        tid = threading.get_ident()

        if event == "call":
            rel_path = filename[len(self._project_dir):].lstrip("/\\")
            func_name = frame.f_code.co_name
            key = f"{rel_path}::{func_name}"

            # Push call start time
            if tid not in self._call_stacks:
                self._call_stacks[tid] = []
            self._call_stacks[tid].append((key, time.perf_counter()))

            with self._lock:
                if key not in self._data:
                    self._data[key] = {
                        "file": rel_path,
                        "function": func_name,
                        "call_count": 0,
                        "total_ms": 0.0,
                    }
                self._data[key]["call_count"] += 1

            return self._trace_calls

        elif event == "return":
            stack = self._call_stacks.get(tid)
            if stack:
                key, start_time = stack.pop()
                elapsed_ms = (time.perf_counter() - start_time) * 1000
                with self._lock:
                    if key in self._data:
                        self._data[key]["total_ms"] += elapsed_ms

        return None

    def _get_summary(self) -> dict:
        with self._lock:
            functions = list(self._data.values())
        total_calls = sum(f["call_count"] for f in functions)
        hot = [f for f in functions if f["call_count"] > 100]
        warm = [f for f in functions if 10 < f["call_count"] <= 100]
        cold = [f for f in functions if 0 < f["call_count"] <= 10]
        dead = [f for f in functions if f["call_count"] == 0]

        return {
            "enabled": self._enabled,
            "total_functions": len(functions),
            "total_calls": total_calls,
            "functions": sorted(functions, key=lambda f: f["call_count"], reverse=True),
            "categories": {
                "hot": len(hot),
                "warm": len(warm),
                "cold": len(cold),
                "dead": len(dead),
            },
        }

    def _flush_to_disk(self):
        try:
            TRACE_FILE.parent.mkdir(parents=True, exist_ok=True)
            summary = self._get_summary()
            tmp = TRACE_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
            tmp.replace(TRACE_FILE)
        except Exception:
            logger.warning("Failed to flush trace data", exc_info=True)

    def _flush_loop(self):
        while not self._stop_event.wait(5.0):
            if self._enabled:
                self._flush_to_disk()


# Global singleton
tracer = RuntimeTracer()
