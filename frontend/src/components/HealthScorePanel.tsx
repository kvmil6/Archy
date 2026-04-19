import React, { useState } from 'react';
import {
  X,
  Heart,
  BarChart3,
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
  FileCode,
} from 'lucide-react';

export interface HealthPenalty {
  category: string;
  cost: number;
  file: string;
  detail: string;
  fix: string;
}

export interface HealthData {
  score: number;
  grade: string;
  breakdown: {
    circular_deps: number;
    god_classes: number;
    orphan_files: number;
    hotspots: number;
    cluttered_models: number;
  };
  penalties: HealthPenalty[];
}

// ── Nav bar pill ────────────────────────────────────────────────────

interface HealthPillProps {
  data: HealthData | null;
  onClick: () => void;
}

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'rgba(74,222,128,0.12)', text: '#4ade80', border: 'rgba(74,222,128,0.3)' },
  B: { bg: 'rgba(96,165,250,0.12)', text: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  C: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  D: { bg: 'rgba(251,146,60,0.12)', text: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  F: { bg: 'rgba(248,113,113,0.12)', text: '#f87171', border: 'rgba(248,113,113,0.3)' },
};

export const HealthPill: React.FC<HealthPillProps> = ({ data, onClick }) => {
  if (!data) return null;
  const c = GRADE_COLORS[data.grade] ?? GRADE_COLORS.C;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all hover:brightness-110"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      title={`Architecture health: ${data.score}/100 (${data.grade})`}
    >
      <Heart className="w-3 h-3" />
      Health
      <span className="font-mono">{data.score}</span>
      /
      <span>{data.grade}</span>
    </button>
  );
};

// ── Full panel ──────────────────────────────────────────────────────

interface HealthScorePanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: HealthData | null;
  onNodeClick?: (filepath: string) => void;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  circular_dependency: { label: 'Circular Dep', color: '#ef4444' },
  god_class:           { label: 'God Class',    color: '#f59e0b' },
  orphan_file:         { label: 'Orphan File',  color: '#8b5cf6' },
  complexity_hotspot:  { label: 'Hotspot',      color: '#3b82f6' },
  cluttered_models:    { label: 'Cluttered',    color: '#ec4899' },
};

export const HealthScorePanel: React.FC<HealthScorePanelProps> = ({ isOpen, onClose, data, onNodeClick }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !data) return null;

  const c = GRADE_COLORS[data.grade] ?? GRADE_COLORS.C;

  const handleShare = () => {
    const counts = Object.entries(data.breakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
      .join(', ');
    const text = `Archy health score: ${data.score}/${data.grade}${counts ? ` — ${counts}` : ''}. Scanned with Archy.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group penalties by category for bar chart
  const categoryTotals: Record<string, number> = {};
  for (const p of data.penalties) {
    categoryTotals[p.category] = (categoryTotals[p.category] ?? 0) + p.cost;
  }
  const maxCost = Math.max(1, ...Object.values(categoryTotals));

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
            <Heart className="w-4 h-4" style={{ color: c.text }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Health Score</h3>
            <p className="text-[10px] text-white/50">Architecture quality grade</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Score display */}
        <div className="text-center py-4">
          <div className="text-5xl font-bold font-mono" style={{ color: c.text }}>
            {data.score}
          </div>
          <div className="text-2xl font-bold mt-1" style={{ color: c.text }}>
            {data.grade}
          </div>
          <div className="text-[11px] text-white/40 mt-2">
            {data.score >= 90 ? 'Excellent architecture' :
             data.score >= 80 ? 'Good architecture' :
             data.score >= 70 ? 'Needs some improvement' :
             data.score >= 60 ? 'Significant issues found' :
             'Critical issues — refactoring needed'}
          </div>
        </div>

        {/* Penalty breakdown bar chart */}
        {Object.keys(categoryTotals).length > 0 && (
          <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-1.5 mb-3">
              <BarChart3 className="w-3.5 h-3.5 text-white/50" />
              <span className="text-xs font-medium text-white/70">Penalty Breakdown</span>
            </div>
            <div className="space-y-2">
              {Object.entries(categoryTotals).map(([cat, cost]) => {
                const meta = CATEGORY_LABELS[cat] ?? { label: cat, color: '#6b7280' };
                const pct = (cost / maxCost) * 100;
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50 w-20 text-right truncate">{meta.label}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                    <span className="text-[10px] font-mono text-white/40 w-6 text-right">-{cost}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Individual penalties */}
        {data.penalties.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-1">
              Issues ({data.penalties.length})
            </div>
            {data.penalties.map((p, i) => {
              const meta = CATEGORY_LABELS[p.category] ?? { label: p.category, color: '#6b7280' };
              return (
                <div key={i} className="bg-surface-800/40 rounded-lg border border-white/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${meta.color}20`, color: meta.color }}
                    >
                      -{p.cost}
                    </span>
                    <span className="text-[11px] text-white/80 flex-1">{p.detail}</span>
                  </div>
                  <div className="flex items-start gap-1.5 pl-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400/60 flex-shrink-0 mt-0.5" />
                    <span className="text-[10px] text-white/40">{p.fix}</span>
                  </div>
                  {p.file && p.file !== '?' && (
                    <button
                      type="button"
                      onClick={() => onNodeClick?.(p.file)}
                      className="flex items-center gap-1 text-[10px] text-blue-400/70 hover:text-blue-400 transition-colors"
                    >
                      <FileCode className="w-3 h-3" />
                      {p.file}
                      <ChevronRight className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <Check className="w-8 h-8 text-green-400/30 mx-auto mb-2" />
            <p className="text-xs text-white/40">No issues detected. Clean architecture!</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-12 border-t border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <span className="text-[10px] text-white/40">
          {data.penalties.length} issue{data.penalties.length !== 1 ? 's' : ''} found
        </span>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>
    </div>
  );
};
