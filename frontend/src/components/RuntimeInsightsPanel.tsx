import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Code2, Cpu, FileCode, GitFork, Layers, RefreshCw, TerminalSquare, X } from 'lucide-react';
import { fetchRuntimeSummary, type RuntimeSummary } from '@/services/runtimeInsights';
import { BACKEND_URL } from '@/services/apiClient';

interface RuntimeInsightsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  framework?: string;
  nodeCount?: number;
  edgeCount?: number;
  fileCount?: number;
}

function formatTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString();
}

export const RuntimeInsightsPanel: React.FC<RuntimeInsightsPanelProps> = ({ isOpen, onClose, framework, nodeCount, edgeCount, fileCount }) => {
  const [summary, setSummary] = useState<RuntimeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [pythonVersion, setPythonVersion] = useState<string | null>(null);
  const [platformInfo, setPlatformInfo] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const data = await fetchRuntimeSummary();
    setSummary(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    refresh();
    fetch(`${BACKEND_URL}/status/runtime-info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPythonVersion(data.python_version);
          setPlatformInfo(`${data.platform} ${data.arch}`);
        }
      })
      .catch(() => {});
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const successRate = useMemo(() => {
    if (!summary || summary.total_events === 0) return 0;
    return Math.round((summary.success_events / summary.total_events) * 100);
  }, [summary]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute top-4 right-4 bottom-16 w-[360px] flex flex-col z-20 overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 12 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.15)' }}>
            <TerminalSquare className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} />
          </div>
          <div>
            <div className="mono-label">RUNTIME</div>
            <div className="text-[13px] font-semibold leading-tight">Terminal Insights</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
        <section>
          <div className="mono-label mb-2">Environment</div>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="Python" value={pythonVersion ?? '—'} color="#3b82f6" icon={<Code2 className="w-3.5 h-3.5" />} />
            <MetricTile label="Framework" value={framework ?? '—'} color="#a78bfa" icon={<Layers className="w-3.5 h-3.5" />} />
            <MetricTile label="Files" value={fileCount ?? '—'} color="#f472b6" icon={<FileCode className="w-3.5 h-3.5" />} />
            <MetricTile label="Nodes" value={nodeCount ?? '—'} color="#34d399" icon={<Cpu className="w-3.5 h-3.5" />} />
            <MetricTile label="Edges" value={edgeCount ?? '—'} color="#fbbf24" icon={<GitFork className="w-3.5 h-3.5" />} />
            <MetricTile label="Platform" value={platformInfo ?? '—'} color="#94a3b8" icon={<TerminalSquare className="w-3.5 h-3.5" />} />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <MetricTile label="Events" value={summary?.total_events ?? 0} color="#22d3ee" icon={<Activity className="w-3.5 h-3.5" />} />
          <MetricTile label="Success" value={`${successRate}%`} color="#4ade80" icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
          <MetricTile label="Failures" value={summary?.failed_events ?? 0} color="#f87171" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
          <MetricTile label="Avg ms" value={summary?.avg_duration_ms ?? '—'} color="#fbbf24" icon={<Clock3 className="w-3.5 h-3.5" />} />
        </div>

        <section>
          <div className="mono-label mb-2">Top Commands</div>
          <div className="space-y-1.5">
            {(summary?.top_commands || []).slice(0, 6).map(([command, count]) => (
              <div
                key={command}
                className="flex items-center justify-between rounded-lg px-2.5 py-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-[11px] truncate pr-2" style={{ color: 'var(--color-text)' }}>{command}</span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{count}</span>
              </div>
            ))}
            {(!summary || summary.top_commands.length === 0) && (
              <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No command activity yet.</div>
            )}
          </div>
        </section>

        <section>
          <div className="mono-label mb-2">Recent Activity</div>
          <div className="space-y-1.5">
            {(summary?.recent_events || []).slice(0, 12).map((event, idx) => (
              <div
                key={`${event.command}-${event.created_at}-${idx}`}
                className="rounded-lg px-2.5 py-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] truncate" style={{ color: 'var(--color-text)' }}>{event.command}</span>
                  <span
                    className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
                    style={{
                      background: event.status === 'success' ? 'rgba(74,222,128,0.15)' : event.status === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(59,130,246,0.15)',
                      color: event.status === 'success' ? '#4ade80' : event.status === 'error' ? '#f87171' : '#60a5fa',
                    }}
                  >
                    {event.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{event.event_type}</span>
                  <span>{event.duration_ms ?? '—'} ms · {formatTimestamp(event.created_at)}</span>
                </div>
              </div>
            ))}
            {(!summary || summary.recent_events.length === 0) && (
              <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No runtime events recorded.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

function MetricTile({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between" style={{ color }}>
        <span className="text-[10px] font-mono uppercase">{label}</span>
        <span>{icon}</span>
      </div>
      <div className="text-[16px] font-semibold mt-1" style={{ color: 'var(--color-text)' }}>{value}</div>
    </div>
  );
}
