/**
 * Part 7B — Runtime Tracing Overlay Panel.
 *
 * Toggle trace on/off, show trace data, import OTel traces.
 * Provides node styling data for the canvas to render heat overlay.
 */
import React, { useState, useCallback } from 'react';
import {
  X,
  Activity,
  Play,
  Square,
  RefreshCw,
  Upload,
  Loader2,
  Flame,
  Thermometer,
  Snowflake,
  CircleDashed,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { useToast } from '@/components/Toast';

// ── Types ───────────────────────────────────────────────────────────

interface TraceFn {
  file: string;
  function: string;
  call_count: number;
  total_ms: number;
}

interface TraceData {
  enabled: boolean;
  total_functions: number;
  total_calls: number;
  functions: TraceFn[];
  categories: { hot: number; warm: number; cold: number; dead: number };
}

export interface TraceNodeStyle {
  nodeId: string;
  heat: 'hot' | 'warm' | 'cold' | 'dead' | 'none';
  callCount: number;
  avgMs: number;
}

interface TraceOverlayPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath?: string;
  /** Called when trace data updates — canvas uses this for node heat styling */
  onTraceUpdate?: (styles: TraceNodeStyle[]) => void;
  /** Current graph nodes for mapping */
  nodes: any[];
}

export const TraceOverlayPanel: React.FC<TraceOverlayPanelProps> = ({
  isOpen,
  onClose,
  projectPath = '',
  onTraceUpdate,
  nodes,
}) => {
  const toast = useToast();
  const [traceData, setTraceData] = useState<TraceData | null>(null);
  const [tracing, setTracing] = useState(false);
  const [loading, setLoading] = useState(false);

  const startTrace = async () => {
    if (!projectPath) {
      toast.warning('No project path', 'Open a project first');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/trace/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_dir: projectPath }),
      });
      if (res.ok) {
        setTracing(true);
        toast.success('Tracing started', 'Run your application to collect data');
      }
    } catch (e) {
      toast.error('Failed to start trace', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const stopTrace = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/trace/stop`, { method: 'POST' });
      if (res.ok) {
        const data: TraceData = (await res.json()).summary ?? (await res.json());
        setTracing(false);
        setTraceData(data);
        applyToCanvas(data);
      }
    } catch (e) {
      toast.error('Failed to stop trace', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshTrace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/trace/current`);
      if (res.ok) {
        const data: TraceData = await res.json();
        setTraceData(data);
        setTracing(data.enabled);
        applyToCanvas(data);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [nodes]);

  const importOTel = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = JSON.parse(text);
        // Handle OTLP export format
        const spans = parsed.resourceSpans
          ? parsed.resourceSpans.flatMap((rs: any) =>
              rs.scopeSpans?.flatMap((ss: any) => ss.spans || []) || []
            )
          : Array.isArray(parsed) ? parsed : parsed.spans || [];

        const res = await fetch(`${BACKEND_URL}/trace/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spans }),
        });
        if (res.ok) {
          const result = await res.json();
          toast.success('OTel imported', `${result.imported} spans → ${result.total_functions} functions`);
          refreshTrace();
        }
      };
      input.click();
    } catch (e) {
      toast.error('Import failed', (e as Error).message);
    }
  };

  const applyToCanvas = (data: TraceData) => {
    if (!data || !onTraceUpdate) return;

    const fnMap = new Map<string, TraceFn>();
    for (const fn of data.functions) {
      // Index by file path and function name for matching
      fnMap.set(`${fn.file}::${fn.function}`, fn);
      fnMap.set(fn.function, fn);
      fnMap.set(fn.file, fn);
    }

    const styles: TraceNodeStyle[] = nodes.map((n: any) => {
      const label = n.data?.label || '';
      const filepath = n.data?.filepath || '';

      // Try to match
      let matched: TraceFn | undefined;
      for (const [key, fn] of fnMap) {
        if (filepath && key.includes(filepath.split('/').pop() || '')) {
          matched = fn;
          break;
        }
        if (label && key.toLowerCase().includes(label.toLowerCase())) {
          matched = fn;
          break;
        }
      }

      const cc = matched?.call_count ?? 0;
      const avgMs = matched && cc > 0 ? matched.total_ms / cc : 0;
      let heat: TraceNodeStyle['heat'] = 'none';
      if (matched) {
        if (cc > 100) heat = 'hot';
        else if (cc > 10) heat = 'warm';
        else if (cc > 0) heat = 'cold';
        else heat = 'dead';
      }

      return { nodeId: n.id, heat, callCount: cc, avgMs };
    });

    onTraceUpdate(styles);
  };

  const clearOverlay = () => {
    onTraceUpdate?.([]);
    setTraceData(null);
  };

  if (!isOpen) return null;

  const cats = traceData?.categories;

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Runtime Trace</h3>
            <p className="text-[10px] text-white/50">
              {tracing ? 'Tracing active' : 'Trace execution overlay'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Controls */}
        <div className="flex gap-2">
          {!tracing ? (
            <button
              onClick={startTrace}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-medium bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-50 transition-colors border border-green-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Trace
            </button>
          ) : (
            <button
              onClick={stopTrace}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors border border-red-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Stop Trace
            </button>
          )}
          <button
            onClick={refreshTrace}
            disabled={loading}
            className="px-3 py-2.5 rounded-lg text-[12px] bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Refresh trace data"
          >
            <RefreshCw className={`w-4 h-4 text-white/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={importOTel}
            className="px-3 py-2.5 rounded-lg text-[12px] bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Import OpenTelemetry trace"
          >
            <Upload className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Legend */}
        <div className="bg-surface-800/50 rounded-xl p-3 border border-white/5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Legend</div>
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div className="flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-red-400" />
              <span className="text-white/50">Hot (&gt;100)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3 h-3 text-orange-400" />
              <span className="text-white/50">Warm (&gt;10)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Snowflake className="w-3 h-3 text-blue-400" />
              <span className="text-white/50">Cold (&gt;0)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CircleDashed className="w-3 h-3 text-gray-500" />
              <span className="text-white/50">Dead (0)</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        {traceData && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Functions" value={traceData.total_functions} />
              <StatBox label="Total calls" value={traceData.total_calls} />
              {cats && <StatBox label="Hot" value={cats.hot} color="#f87171" />}
              {cats && <StatBox label="Dead code" value={cats.dead} color="#6b7280" />}
            </div>

            {/* Top functions */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                Top functions ({traceData.functions.length})
              </div>
              {traceData.functions.slice(0, 30).map((fn, i) => {
                const avgMs = fn.call_count > 0 ? fn.total_ms / fn.call_count : 0;
                const heat = fn.call_count > 100 ? '#f87171' : fn.call_count > 10 ? '#fb923c' : fn.call_count > 0 ? '#60a5fa' : '#6b7280';
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/3 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: heat }} />
                    <span className="text-white/70 truncate flex-1 font-mono">{fn.function}</span>
                    <span className="text-white/30 font-mono text-[10px] flex-shrink-0">
                      {fn.call_count}× {avgMs > 0 ? `${avgMs.toFixed(1)}ms` : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={clearOverlay}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border border-white/10 hover:bg-white/5 text-white/50 transition-colors"
            >
              Clear overlay
            </button>
          </>
        )}

        {!traceData && !tracing && (
          <div className="text-center py-8">
            <Activity className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-[12px] text-white/40">No trace data yet</p>
            <p className="text-[10px] text-white/25 mt-1">
              Start tracing or import an OpenTelemetry export
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface-800/40 rounded-lg p-2.5 border border-white/5">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-white/30">{label}</div>
      <div className="text-[18px] font-bold font-mono" style={{ color: color || 'white' }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
