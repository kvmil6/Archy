import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X,
    Stethoscope,
    Loader2,
    RefreshCw,
    AlertTriangle,
    Zap,
    CheckCircle2,
    ChevronRight,
    Copy,
    Check,
    KeyRound,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';

interface ArchDoctorProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: any[];
    edges: any[];
    metrics: any | null;
    framework: string;
    model?: string;
}

export const ArchDoctorPanel: React.FC<ArchDoctorProps> = ({
    isOpen,
    onClose,
    nodes,
    edges,
    metrics,
    framework,
    model,
}) => {
    const [report, setReport] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [copied, setCopied] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    // Reset state each time panel opens fresh
    useEffect(() => {
        if (isOpen) {
            setReport('');
            setHasScanned(false);
            setIsScanning(false);
        } else {
            abortRef.current?.abort();
        }
    }, [isOpen]);

    // Auto-scan when panel opens and graph has data
    useEffect(() => {
        if (isOpen && nodes.length > 0 && !hasScanned && !isScanning) {
            runScan();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, nodes.length]);

    const runScan = useCallback(async () => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setReport('');
        setIsScanning(true);
        setHasScanned(true);

        try {
            const resp = await fetch(`${BACKEND_URL}/insights/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, edges, metrics, framework, model }),
                signal: abortRef.current.signal,
            });

            if (!resp.ok || !resp.body) {
                const err = await resp.json().catch(() => ({}));
                const detail = err?.detail ?? `HTTP ${resp.status}`;
                setReport(`**Error:** ${detail}`);
                return;
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(raw);
                        const delta = parsed?.choices?.[0]?.delta?.content ?? '';
                        if (delta) setReport(prev => prev + delta);
                    } catch {
                        /* skip malformed chunks */
                    }
                }
            }
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                setReport(`**Error:** ${err?.message ?? 'Unknown error'}`);
            }
        } finally {
            setIsScanning(false);
        }
    }, [nodes, edges, metrics, framework, model]);

    if (!isOpen) return null;

    // Parse health score from report text
    const scoreMatch = report.match(/Health Score:\s*(\d+)\/100/i);
    const healthScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const scoreColor =
        healthScore === null ? 'var(--color-text-faint)'
        : healthScore >= 75 ? '#34d399'
        : healthScore >= 50 ? '#fbbf24'
        : '#f87171';

    // Detect API key error
    const isApiKeyError = report.toLowerCase().includes('api key') || report.toLowerCase().includes('openrouter') || report.toLowerCase().includes('401') || report.toLowerCase().includes('403');

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(report.replace(/\*\*/g, '').replace(/^[#]+\s/gm, ''));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    // Render markdown to JSX
    const renderMarkdown = (text: string) => {
        const lines = text.split('\n');
        return lines.map((line, i) => {
            if (/^###\s/.test(line)) {
                return <h4 key={i} className="text-[12px] font-bold mt-3 mb-1" style={{ color: 'var(--color-text)' }}>{line.replace(/^###\s/, '')}</h4>;
            }
            if (/^##\s/.test(line)) {
                const isHealthScore = /Health Score/i.test(line);
                return (
                    <h3 key={i} className="text-[13px] font-bold mt-4 mb-1.5 flex items-center gap-2" style={{ color: isHealthScore ? scoreColor : 'var(--color-accent)' }}>
                        {isHealthScore && healthScore !== null && (
                            <span className="text-[22px] font-mono font-black" style={{ color: scoreColor }}>{healthScore}</span>
                        )}
                        <span>{line.replace(/^##\s/, '')}</span>
                    </h3>
                );
            }
            if (/^#\s/.test(line)) {
                return <h2 key={i} className="text-[14px] font-semibold mt-3 mb-1" style={{ color: 'var(--color-accent)' }}>{line.replace(/^#\s/, '')}</h2>;
            }
            if (/^\*\s|^-\s/.test(line)) {
                const content = line.replace(/^[*-]\s/, '');
                const parts = content.split(/(\*\*[^*]+\*\*)/g);
                return (
                    <div key={i} className="flex gap-2 py-0.5">
                        <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                        <span className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {parts.map((p, pi) =>
                                /^\*\*/.test(p)
                                    ? <strong key={pi} style={{ color: 'var(--color-text)', fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong>
                                    : p
                            )}
                        </span>
                    </div>
                );
            }
            if (line.trim() === '') return <div key={i} className="h-2" />;
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
                <p key={i} className="text-[12px] leading-relaxed mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {parts.map((p, pi) =>
                        /^\*\*/.test(p)
                            ? <strong key={pi} style={{ color: 'var(--color-text)', fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong>
                            : p
                    )}
                </p>
            );
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-xl rounded-2xl border overflow-hidden flex flex-col"
                style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border-strong)',
                    maxHeight: '82vh',
                    boxShadow: 'var(--shadow-lg)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
                    style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2.5">
                        <Stethoscope className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                        <span className="text-[14px] font-semibold">Architecture Doctor</span>
                        {healthScore !== null && !isScanning && (
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full"
                                style={{ background: `${scoreColor}18`, color: scoreColor }}>
                                {healthScore}/100
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {report && !isScanning && (
                            <button onClick={handleCopy}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors hover:border-[var(--color-accent)]"
                                style={{ borderColor: 'var(--color-border-strong)', color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                                title="Copy report to clipboard">
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        )}
                        {hasScanned && (
                            <button onClick={runScan} disabled={isScanning}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors hover:border-[var(--color-accent)] disabled:opacity-40"
                                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}>
                                <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                                Re-scan
                            </button>
                        )}
                        <button onClick={onClose} className="hover:opacity-70 transition-opacity">
                            <X className="w-4 h-4" style={{ color: 'var(--color-text-faint)' }} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                    {!hasScanned ? (
                        /* Empty state: auto-scan will fire via useEffect */
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                                style={{ background: 'rgba(124,134,255,0.1)', border: '1px solid rgba(124,134,255,0.2)' }}>
                                <Stethoscope className="w-7 h-7" style={{ color: 'var(--color-accent)' }} />
                            </div>
                            <p className="text-[14px] font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>Architecture Doctor</p>
                            <p className="text-[12px] mb-6" style={{ color: 'var(--color-text-muted)' }}>
                                AI-powered analysis of {nodes.length} nodes · {edges.length} edges
                            </p>
                            {nodes.length === 0 ? (
                                <div className="flex items-center gap-2 text-[12px] font-mono rounded-lg px-4 py-2.5 border"
                                    style={{ background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)', color: 'var(--color-warning)' }}>
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    Run analysis first to generate graph data
                                </div>
                            ) : (
                                <button onClick={runScan}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
                                    style={{ background: 'linear-gradient(135deg, #7c86ff, #6366f1)', boxShadow: '0 4px 20px rgba(124,134,255,0.3)' }}>
                                    <Zap className="w-4 h-4" />Scan architecture
                                </button>
                            )}
                        </div>
                    ) : isScanning && !report ? (
                        <div className="flex flex-col items-center justify-center py-14 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-accent)' }} />
                            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Analysing your architecture…</p>
                            <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                                {nodes.length} nodes · {framework}
                            </p>
                        </div>
                    ) : report.startsWith('**Error:**') ? (
                        /* Error state */
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                            {isApiKeyError ? (
                                <>
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
                                        style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
                                        <KeyRound className="w-6 h-6" style={{ color: 'var(--color-warning)' }} />
                                    </div>
                                    <div>
                                        <p className="text-[14px] font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>AI key required</p>
                                        <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                                            Add your OpenRouter API key on the homepage to enable Architecture Doctor.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <AlertTriangle className="w-8 h-8" style={{ color: 'var(--color-danger)' }} />
                                    <div>
                                        <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Scan failed</p>
                                        <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                            {report.replace('**Error:** ', '')}
                                        </p>
                                    </div>
                                </>
                            )}
                            <button onClick={runScan}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-[12px] font-medium transition-colors hover:border-[var(--color-accent)]"
                                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}>
                                <RefreshCw className="w-3.5 h-3.5" />Retry
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {renderMarkdown(report)}
                            {isScanning && (
                                <span className="inline-block w-2 h-4 rounded-sm animate-pulse" style={{ background: 'var(--color-accent)' }} />
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {hasScanned && !isScanning && report && !report.startsWith('**Error:**') && (
                    <div className="px-5 py-2 border-t flex items-center gap-4 text-[10px] font-mono shrink-0"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}>
                        <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />{nodes.length} nodes
                        </span>
                        <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />{edges.length} edges
                        </span>
                        <span className="uppercase">{framework}</span>
                    </div>
                )}
            </div>
        </div>
    );
};


