import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, RefreshCw, X, Circle, Trash2, Download } from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';

interface RuntimeEvent {
    event_type: string;
    command: string;
    status: string;
    duration_ms: number | null;
    source: string;
    created_at: string;
    metadata: Record<string, unknown>;
}

interface TerminalPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
    success: '#4ade80',
    error: '#f87171',
    running: '#fbbf24',
    pending: '#94a3b8',
};

const TYPE_LABEL: Record<string, string> = {
    analysis: 'ANALYSE',
    ai_request: 'AI',
    file_read: 'READ',
    editor_open: 'EDITOR',
    export: 'EXPORT',
    security: 'SECURITY',
    db: 'DB',
};

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return '--:--:--';
    }
}

function EventRow({ ev }: { ev: RuntimeEvent }) {
    const color = STATUS_COLOR[ev.status] ?? '#94a3b8';
    const label = TYPE_LABEL[ev.event_type] ?? ev.event_type.toUpperCase().slice(0, 7);

    return (
        <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.03] font-mono text-[11px] group">
            <span className="text-white/30 shrink-0 tabular-nums">{formatTime(ev.created_at)}</span>
            <span
                className="shrink-0 px-1 rounded text-[9px] font-bold"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
            >
                {label}
            </span>
            <span
                className="w-1.5 h-1.5 rounded-full mt-1 shrink-0"
                style={{ background: color }}
            />
            <span className="flex-1 text-white/70 truncate">{ev.command}</span>
            {ev.duration_ms != null && (
                <span className="text-white/25 shrink-0 tabular-nums">{ev.duration_ms}ms</span>
            )}
        </div>
    );
}

export function TerminalPanel({ isOpen, onClose }: TerminalPanelProps) {
    const [events, setEvents] = useState<RuntimeEvent[]>([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [backendOnline, setBackendOnline] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<number | null>(null);

    const fetchEvents = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/runtime/events?limit=200`);
            if (res.ok) {
                const data: RuntimeEvent[] = await res.json();
                setEvents(data);
                setBackendOnline(true);
            } else {
                setBackendOnline(false);
            }
        } catch {
            setBackendOnline(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        fetchEvents();
        if (autoRefresh) {
            intervalRef.current = window.setInterval(fetchEvents, 2000);
        }
        return () => {
            if (intervalRef.current != null) window.clearInterval(intervalRef.current);
        };
    }, [isOpen, autoRefresh, fetchEvents]);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [events.length]);

    const downloadLogs = () => {
        const text = events.map(ev =>
            `[${formatTime(ev.created_at)}] [${ev.event_type}] [${ev.status}] ${ev.command}${ev.duration_ms != null ? ` (${ev.duration_ms}ms)` : ''}`
        ).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `archy-log-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div
            className="flex flex-col h-full"
            style={{ background: '#0d0d14', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-3 py-2 shrink-0 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a10' }}
            >
                <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-mono font-semibold text-white/70 uppercase tracking-wider">
                        Activity Log
                    </span>
                    <div className="flex items-center gap-1.5 ml-2">
                        <Circle
                            className="w-2 h-2"
                            fill={backendOnline ? '#4ade80' : '#f87171'}
                            stroke="none"
                        />
                        <span className="text-[10px] font-mono text-white/35">
                            {backendOnline ? 'live' : 'offline'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setAutoRefresh(r => !r)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors hover:bg-white/5"
                        style={{ color: autoRefresh ? '#4ade80' : '#94a3b8' }}
                        title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
                    >
                        <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                        {autoRefresh ? 'LIVE' : 'PAUSED'}
                    </button>
                    <button
                        onClick={fetchEvents}
                        className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                        title="Refresh now"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={downloadLogs}
                        className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                        title="Download log"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setEvents([])}
                        className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                        title="Clear"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Log body */}
            <div className="flex-1 overflow-y-auto py-1">
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
                        <Terminal className="w-8 h-8" />
                        <p className="text-[11px] font-mono">
                            {backendOnline ? 'No events yet — start analyzing a project.' : 'Backend offline.'}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* newest first */}
                        {[...events].reverse().map((ev, i) => (
                            <EventRow key={`${ev.created_at}-${i}`} ev={ev} />
                        ))}
                        <div ref={bottomRef} />
                    </>
                )}
            </div>

            {/* Footer stats */}
            {events.length > 0 && (
                <div
                    className="px-3 py-1.5 border-t flex items-center gap-4 text-[10px] font-mono text-white/30 shrink-0"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                >
                    <span>{events.length} events</span>
                    <span className="text-emerald-400/60">
                        {events.filter(e => e.status === 'success').length} ok
                    </span>
                    <span className="text-red-400/60">
                        {events.filter(e => e.status === 'error').length} err
                    </span>
                </div>
            )}
        </div>
    );
}
