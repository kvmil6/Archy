/**
 * Part 5 — Architecture Diff Panel.
 *
 * Snapshot management + diff visualisation overlay.
 * Shows added/removed/changed nodes + summary banner.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  GitCompare,
  Save,
  Loader2,
  Plus,
  Minus,
  PenLine,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { useToast } from '@/components/Toast';

// ── Types ───────────────────────────────────────────────────────────

interface Snapshot {
  name: string;
  filename: string;
  saved_at: string;
  framework: string;
  node_count: number;
  edge_count: number;
}

export interface DiffResult {
  added_nodes: any[];
  removed_nodes: any[];
  changed_nodes: any[];
  added_edges: any[];
  removed_edges: any[];
  summary: string;
}

interface DiffPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: any[];
  edges: any[];
  framework?: string;
  projectPath?: string;
  /** Apply diff styling to the canvas */
  onDiffApply?: (diff: DiffResult | null) => void;
}

export const DiffPanel: React.FC<DiffPanelProps> = ({
  isOpen,
  onClose,
  nodes,
  edges,
  framework = 'unknown',
  projectPath = '',
  onDiffApply,
}) => {
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedA, setSelectedA] = useState<string>('');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffing, setDiffing] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/snapshots/list`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (isOpen) loadSnapshots();
  }, [isOpen, loadSnapshots]);

  const saveSnapshot = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/snapshots/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          nodes,
          edges,
          framework,
          project_path: projectPath,
        }),
      });
      if (res.ok) {
        toast.success('Snapshot saved', saveName.trim());
        setSaveName('');
        loadSnapshots();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error('Save failed', d.detail || 'Unknown error');
      }
    } catch (e) {
      toast.error('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runDiff = async () => {
    if (!selectedA) return;
    setDiffing(true);
    setDiffResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/snapshots/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot_a: selectedA,
          current_nodes: nodes,
          current_edges: edges,
        }),
      });
      if (res.ok) {
        const data: DiffResult = await res.json();
        setDiffResult(data);
        onDiffApply?.(data);
      }
    } catch (e) {
      toast.error('Diff failed', (e as Error).message);
    } finally {
      setDiffing(false);
    }
  };

  const clearDiff = () => {
    setDiffResult(null);
    onDiffApply?.(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <GitCompare className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Architecture Diff</h3>
            <p className="text-[10px] text-white/50">Compare graph snapshots</p>
          </div>
        </div>
        <button onClick={() => { clearDiff(); onClose(); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Save new snapshot */}
        <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Save Snapshot</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveSnapshot()}
              placeholder="Snapshot name..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={saveSnapshot}
              disabled={saving || !saveName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 transition-colors border border-cyan-500/20"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
          <p className="text-[10px] text-white/30">
            Current graph: {nodes.length} nodes · {edges.length} edges
          </p>
        </div>

        {/* Existing snapshots */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
              Snapshots ({snapshots.length})
            </div>
            <button onClick={loadSnapshots} className="p-1 hover:bg-white/10 rounded transition-colors">
              <RefreshCw className="w-3 h-3 text-white/30" />
            </button>
          </div>
          {snapshots.length === 0 && (
            <p className="text-[11px] text-white/30 py-4 text-center">No snapshots yet</p>
          )}
          {snapshots.map((s) => (
            <button
              key={s.filename}
              type="button"
              onClick={() => setSelectedA(s.name)}
              className="w-full text-left bg-surface-800/40 rounded-xl border p-3 hover:border-white/15 transition-colors space-y-1"
              style={{
                borderColor: selectedA === s.name ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.05)',
                background: selectedA === s.name ? 'rgba(6,182,212,0.06)' : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-white/80">{s.name}</span>
                <span className="text-[9px] font-mono text-white/30">
                  {new Date(s.saved_at).toLocaleDateString()}
                </span>
              </div>
              <div className="text-[10px] text-white/40">
                {s.node_count} nodes · {s.edge_count} edges · {s.framework}
              </div>
            </button>
          ))}
        </div>

        {/* Diff controls */}
        {selectedA && (
          <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
              Compare "{selectedA}" → Current
            </div>
            <button
              onClick={runDiff}
              disabled={diffing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors border border-cyan-500/20"
            >
              {diffing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
              Run Diff
            </button>
          </div>
        )}

        {/* Diff results */}
        {diffResult && (
          <div className="space-y-3">
            {/* Summary banner */}
            <div className="bg-surface-800/50 rounded-xl p-3 border border-white/5">
              <div className="text-[12px] font-semibold text-white/80 mb-2">Diff Summary</div>
              <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                {diffResult.added_nodes.length > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/20">
                    <Plus className="w-3 h-3" /> {diffResult.added_nodes.length} added
                  </span>
                )}
                {diffResult.removed_nodes.length > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">
                    <Minus className="w-3 h-3" /> {diffResult.removed_nodes.length} removed
                  </span>
                )}
                {diffResult.changed_nodes.length > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <PenLine className="w-3 h-3" /> {diffResult.changed_nodes.length} changed
                  </span>
                )}
                {diffResult.added_edges.length > 0 && (
                  <span className="text-green-400/60">+{diffResult.added_edges.length} edges</span>
                )}
                {diffResult.removed_edges.length > 0 && (
                  <span className="text-red-400/60">-{diffResult.removed_edges.length} edges</span>
                )}
              </div>
            </div>

            {/* Added nodes */}
            {diffResult.added_nodes.length > 0 && (
              <DiffSection title="Added" color="#4ade80" items={diffResult.added_nodes} />
            )}
            {diffResult.removed_nodes.length > 0 && (
              <DiffSection title="Removed" color="#f87171" items={diffResult.removed_nodes} />
            )}
            {diffResult.changed_nodes.length > 0 && (
              <DiffSection title="Changed" color="#fbbf24" items={diffResult.changed_nodes.map((c: any) => c.after || c)} />
            )}

            <button
              onClick={clearDiff}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border border-white/10 hover:bg-white/5 text-white/50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear diff overlay
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

function DiffSection({ title, color, items }: { title: string; color: string; items: any[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>{title} ({items.length})</div>
      {items.slice(0, 20).map((n: any, i: number) => (
        <div key={n.id ?? i} className="flex items-center gap-2 px-2 py-1 rounded bg-white/3">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-[11px] text-white/70 truncate">{n.data?.label || n.id || '?'}</span>
          <span className="text-[9px] font-mono text-white/30 ml-auto">{n.type || ''}</span>
        </div>
      ))}
      {items.length > 20 && (
        <p className="text-[10px] text-white/30 pl-4">+{items.length - 20} more</p>
      )}
    </div>
  );
}
