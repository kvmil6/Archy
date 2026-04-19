from __future__ import annotations

from collections import Counter, deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Deque, Dict, List, Optional


@dataclass
class RuntimeEvent:
    event_type: str
    command: str
    status: str
    duration_ms: Optional[int] = None
    source: str = "frontend"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RuntimeTracker:
    def __init__(self, max_events: int = 500):
        self._events: Deque[RuntimeEvent] = deque(maxlen=max_events)
        self._lock = Lock()

    def record(
        self,
        event_type: str,
        command: str,
        status: str,
        duration_ms: Optional[int] = None,
        source: str = "frontend",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> RuntimeEvent:
        event = RuntimeEvent(
            event_type=event_type,
            command=command,
            status=status,
            duration_ms=duration_ms,
            source=source,
            metadata=metadata or {},
        )
        with self._lock:
            self._events.append(event)
        return event

    def summary(self) -> Dict[str, Any]:
        with self._lock:
            events = list(self._events)

        total = len(events)
        status_counter = Counter(event.status for event in events)
        type_counter = Counter(event.event_type for event in events)
        command_counter = Counter(event.command for event in events)

        completed = [event for event in events if event.duration_ms is not None]
        avg_duration = (
            round(sum(event.duration_ms or 0 for event in completed) / len(completed), 2)
            if completed
            else None
        )

        return {
            "total_events": total,
            "success_events": status_counter.get("success", 0),
            "failed_events": status_counter.get("error", 0),
            "avg_duration_ms": avg_duration,
            "by_type": dict(type_counter),
            "top_commands": command_counter.most_common(8),
            "recent_events": [asdict(event) for event in events[-30:]][::-1],
        }


runtime_tracker = RuntimeTracker()
