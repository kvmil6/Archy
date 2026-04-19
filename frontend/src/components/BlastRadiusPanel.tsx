/**
 * Feature 1 — Blast Radius Analysis Panel.
 *
 * Right-click a node → "Blast Radius" → see concentric rings of impact.
 * Highlights affected nodes on the canvas with severity-based coloring.
 */
import React, { useState, useCallback } from 'react';
import {
  X,
  Target,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Zap,
  Circle,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';

interface RingNode {
  id: string;
  label: string;
  type: string;
  filepath: string;
  ring: number;
}

interface Ring {
  ring: number;
  severity: 'direct' | 'transitive' | 'indirect';
  nodes: RingNode[];
}

interface BlastResult {
  target: { id: string; label: string; type: string };
  rings: Ring[];
  total_affected: number;
  severity_summary: { direct: number; transitive: number; indirect: number };
}

interface BlastRadiusPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: any[];
  edges: any[];
  /** Currently selected node for blast analysis */
  targetNodeId: string | null;
  /** Highlight nodes on canvas */
  onHighlightNodes?: (nodeIds: string[], color: string) => void;
  /** Focus a node */
  onFocusNode?: (nodeId: string) => void;
}

const RING_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  direct:     { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20', hex: '#ef4444' },
  transitive: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20', hex: '#f59e0b' },
  indirect:   { bg: 'bg-yellow-500/10', text: 'text-yellow-300/60', border: 'border-yellow-500/15', hex: '#eab308' },
};

export const BlastRadiusPanel: React.FC<BlastRadiusPanelProps> = ({
  isOpen,
  onClose,
  nodes,
  edges,
  targetNodeId,
  onHighlightNodes,
  onFocusNode,
}) => {
  const [result, setResult] = useState<BlastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async (nodeId: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/analyze/blast-radius`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, nodes, edges }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Failed: ${res.status}`);
      }
      const data: BlastResult = await res.json();
      setResult(data);

      // Highlight on canvas
      if (onHighlightNodes) {
        const allAffected = data.rings.flatMap((r) => r.nodes.map((n) => n.id));
        onHighlightNodes(allAffected, '#ef4444');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [nodes, edges, onHighlightNodes]);

  // Auto-run when target changes
  React.useEffect(() => {
    if (isOpen && targetNodeId) {
      runAnalysis(targetNodeId);
    }
  }, [isOpen, targetNodeId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[380px] bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Blast Radius</h3>
            <p className="text-[10px] text-white/50">Impact analysis</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex flex-col items-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-red-400" />
            <span className="text-[11px] text-white/40">Computing blast radius...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-[12px] text-red-300">{error}</div>
        )}

        {result && !loading && (
          <>
            {/* Target */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Target node</div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-red-400" />
                <span className="text-[13px] font-semibold text-white">{result.target.label}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                  {result.target.type}
                </span>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              {(['direct', 'transitive', 'indirect'] as const).map((sev) => {
                const count = result.severity_summary[sev];
                const cfg = RING_COLORS[sev];
                return (
                  <div key={sev} className={`rounded-lg p-3 border ${cfg.bg} ${cfg.border}`}>
                    <div className={`text-[8px] font-bold uppercase ${cfg.text}`}>{sev}</div>
                    <div className={`text-[22px] font-bold font-mono ${cfg.text}`}>{count}</div>
                  </div>
                );
              })}
            </div>

            {result.total_affected === 0 && (
              <div className="text-center py-8">
                <Circle className="w-10 h-10 text-green-400/30 mx-auto mb-3" />
                <p className="text-[13px] text-green-400/70 font-medium">No blast radius</p>
                <p className="text-[10px] text-white/30 mt-1">This node has no dependents</p>
              </div>
            )}

            {/* Ring details */}
            {result.rings.map((ring) => {
              const cfg = RING_COLORS[ring.severity];
              return (
                <div key={ring.ring} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full`} style={{ background: cfg.hex }} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>
                      Ring {ring.ring} — {ring.severity}
                    </span>
                    <span className="text-[9px] font-mono text-white/30">{ring.nodes.length} nodes</span>
                  </div>
                  {ring.nodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => onFocusNode?.(node.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all hover:bg-white/5 ${cfg.border}`}
                      style={{ background: `${cfg.hex}08` }}
                    >
                      <span className="text-[11px] font-medium text-white/80 truncate flex-1">{node.label}</span>
                      <span className="text-[8px] font-mono text-white/30">{node.type}</span>
                      <ChevronRight className="w-3 h-3 text-white/20" />
                    </button>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
