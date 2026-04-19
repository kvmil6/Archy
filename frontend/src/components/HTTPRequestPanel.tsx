import { useState, useRef } from 'react';
import { Send, X, Trash2, Copy, ChevronDown, Loader2, Globe, CheckCircle2 } from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface HistoryEntry {
    id: number;
    method: Method;
    url: string;
    status: number | null;
    durationMs: number;
    responseBody: string;
    error: string | null;
    timestamp: string;
}

const METHOD_COLOR: Record<Method, string> = {
    GET: '#4ade80',
    POST: '#fbbf24',
    PUT: '#60a5fa',
    DELETE: '#f87171',
    PATCH: '#a78bfa',
};

const PRESET_ENDPOINTS = [
    { label: 'Health check', method: 'GET' as Method, url: '/health' },
    { label: 'AI status', method: 'GET' as Method, url: '/status/ai' },
    { label: 'Runtime summary', method: 'GET' as Method, url: '/runtime/summary' },
    { label: 'Recent events', method: 'GET' as Method, url: '/runtime/events?limit=20' },
    { label: 'Detect editors', method: 'GET' as Method, url: '/editor/detect' },
    { label: 'List models', method: 'GET' as Method, url: '/models' },
];

let idCounter = 0;

function formatStatus(status: number | null): { label: string; color: string } {
    if (status === null) return { label: 'ERR', color: '#f87171' };
    if (status < 300) return { label: String(status), color: '#4ade80' };
    if (status < 400) return { label: String(status), color: '#fbbf24' };
    return { label: String(status), color: '#f87171' };
}

function tryPrettyJson(raw: string): string {
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}

interface HTTPRequestPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function HTTPRequestPanel({ isOpen, onClose }: HTTPRequestPanelProps) {
    const [method, setMethod] = useState<Method>('GET');
    const [url, setUrl] = useState('/health');
    const [body, setBody] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [selected, setSelected] = useState<HistoryEntry | null>(null);
    const [showPresets, setShowPresets] = useState(false);
    const [copied, setCopied] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const sendRequest = async () => {
        if (loading) {
            abortRef.current?.abort();
            return;
        }

        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);

        const fullUrl = url.startsWith('http') ? url : `${BACKEND_URL}${url.startsWith('/') ? url : `/${url}`}`;
        const start = Date.now();
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

        try {
            const init: RequestInit = {
                method,
                signal: ctrl.signal,
                headers: { 'Content-Type': 'application/json' },
            };
            if (['POST', 'PUT', 'PATCH'].includes(method) && body.trim()) {
                init.body = body.trim();
            }
            const res = await fetch(fullUrl, init);
            const durationMs = Date.now() - start;
            const text = await res.text();
            const entry: HistoryEntry = {
                id: ++idCounter,
                method, url,
                status: res.status,
                durationMs,
                responseBody: tryPrettyJson(text),
                error: null,
                timestamp,
            };
            setHistory(h => [entry, ...h.slice(0, 49)]);
            setSelected(entry);
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            const entry: HistoryEntry = {
                id: ++idCounter,
                method, url,
                status: null,
                durationMs: Date.now() - start,
                responseBody: '',
                error: (err as Error).message,
                timestamp,
            };
            setHistory(h => [entry, ...h.slice(0, 49)]);
            setSelected(entry);
        } finally {
            setLoading(false);
        }
    };

    const copyResponse = () => {
        if (!selected) return;
        navigator.clipboard.writeText(selected.responseBody || selected.error || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    if (!isOpen) return null;

    return (
        <div className="flex h-full" style={{ background: '#0d0d14', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Left: history */}
            <div
                className="w-48 flex flex-col shrink-0 border-r"
                style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a10' }}
            >
                <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span className="text-[10px] font-mono font-semibold text-white/40 uppercase tracking-wider">History</span>
                    {history.length > 0 && (
                        <button onClick={() => { setHistory([]); setSelected(null); }} className="text-white/25 hover:text-white/50 transition-colors">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {history.length === 0 ? (
                        <p className="text-center text-[10px] font-mono text-white/20 mt-6 px-2">No requests yet</p>
                    ) : (
                        history.map(h => {
                            const s = formatStatus(h.status);
                            return (
                                <button
                                    key={h.id}
                                    onClick={() => setSelected(h)}
                                    className={`w-full text-left px-2 py-1.5 border-b transition-colors ${selected?.id === h.id ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}
                                    style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                                >
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-[9px] font-bold font-mono" style={{ color: METHOD_COLOR[h.method] }}>
                                            {h.method}
                                        </span>
                                        <span className="text-[9px] font-mono font-bold" style={{ color: s.color }}>{s.label}</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-white/50 truncate">{h.url}</div>
                                    <div className="text-[9px] font-mono text-white/20">{h.timestamp}</div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right: request + response */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div
                    className="flex items-center justify-between px-3 py-2 shrink-0 border-b"
                    style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0a10' }}
                >
                    <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[11px] font-mono font-semibold text-white/70 uppercase tracking-wider">HTTP Tester</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* URL bar */}
                <div className="px-3 py-2 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {/* Method */}
                    <div className="relative shrink-0">
                        <button
                            className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-bold font-mono border transition-colors hover:bg-white/5"
                            style={{ color: METHOD_COLOR[method], borderColor: `${METHOD_COLOR[method]}40`, background: `${METHOD_COLOR[method]}10` }}
                            onClick={() => {
                                const methods: Method[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
                                const idx = methods.indexOf(method);
                                setMethod(methods[(idx + 1) % methods.length]);
                            }}
                            title="Click to cycle method"
                        >
                            {method}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </button>
                    </div>

                    {/* URL input */}
                    <input
                        type="text"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendRequest(); }}
                        className="flex-1 font-mono text-[12px] bg-transparent border border-white/10 rounded px-2.5 py-1.5 text-white/80 outline-none focus:border-blue-500/50 transition-colors placeholder:text-white/20"
                        placeholder="/health"
                        spellCheck={false}
                    />

                    {/* Presets */}
                    <div className="relative">
                        <button
                            onClick={() => setShowPresets(s => !s)}
                            className="px-2 py-1.5 rounded text-[10px] font-mono border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                        >
                            Presets
                        </button>
                        {showPresets && (
                            <div
                                className="absolute top-8 right-0 z-50 rounded-lg border py-1 shadow-xl min-w-[180px]"
                                style={{ background: '#151520', borderColor: 'rgba(255,255,255,0.1)' }}
                            >
                                {PRESET_ENDPOINTS.map(p => (
                                    <button
                                        key={p.url}
                                        onClick={() => { setMethod(p.method); setUrl(p.url); setShowPresets(false); }}
                                        className="w-full text-left px-3 py-1.5 hover:bg-white/5 transition-colors"
                                    >
                                        <span className="text-[9px] font-bold font-mono mr-2" style={{ color: METHOD_COLOR[p.method] }}>{p.method}</span>
                                        <span className="text-[11px] font-mono text-white/60">{p.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Send */}
                    <button
                        onClick={sendRequest}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-all"
                        style={{ background: loading ? '#374151' : '#6366f1', color: 'white' }}
                    >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {loading ? 'Cancel' : 'Send'}
                    </button>
                </div>

                {/* Body editor (only for POST/PUT/PATCH) */}
                {['POST', 'PUT', 'PATCH'].includes(method) && (
                    <div className="border-b px-3 py-2 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div className="text-[10px] font-mono text-white/30 mb-1 uppercase tracking-wider">Request Body (JSON)</div>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            className="w-full font-mono text-[11px] bg-black/20 border border-white/8 rounded px-2.5 py-2 text-white/70 outline-none focus:border-blue-500/40 resize-none transition-colors placeholder:text-white/20"
                            rows={3}
                            placeholder='{"key": "value"}'
                            spellCheck={false}
                        />
                    </div>
                )}

                {/* Response */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {selected ? (
                        <>
                            <div className="px-3 py-2 border-b flex items-center gap-3 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                {(() => {
                                    const s = formatStatus(selected.status);
                                    return (
                                        <span className="text-[11px] font-bold font-mono" style={{ color: s.color }}>
                                            {s.label}
                                        </span>
                                    );
                                })()}
                                <span className="text-[10px] font-mono text-white/30">{selected.durationMs}ms</span>
                                <span className="flex-1" />
                                <button onClick={copyResponse} className="flex items-center gap-1 text-[10px] font-mono text-white/30 hover:text-white/60 transition-colors">
                                    {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-3">
                                {selected.error ? (
                                    <p className="font-mono text-[11px] text-red-400/80">{selected.error}</p>
                                ) : (
                                    <pre className="font-mono text-[11px] text-white/65 whitespace-pre-wrap break-words leading-relaxed">
                                        {selected.responseBody}
                                    </pre>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/20">
                            <Globe className="w-8 h-8" />
                            <p className="text-[11px] font-mono">Send a request to see the response</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
