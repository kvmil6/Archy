/**
 * Part 8B — Graph-Aware Security Scanner Panel.
 *
 * Runs graph-aware OWASP rules, shows issues by severity,
 * links to nodes on canvas and opens files in canvas editor.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileCode,
  ChevronRight,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { getFileContent } from '@/services/fileSystem';

// ── Types ───────────────────────────────────────────────────────────

interface SecurityIssue {
  rule: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  description: string;
  node_id: string;
  filepath: string;
  line?: number;
}

interface ScanResult {
  total: number;
  by_severity: Record<string, number>;
  issues: SecurityIssue[];
}

interface GraphSecurityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: any[];
  edges: any[];
  /** Highlight a node on the canvas */
  onHighlightNode?: (nodeId: string) => void;
  /** Open a file in the canvas editor */
  onOpenFile?: (filepath: string, line?: number) => void;
  /** Auto-run after analysis */
  autoRun?: boolean;
}

const SEVERITY_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string; border: string }> = {
  CRITICAL: { icon: <ShieldX className="w-3.5 h-3.5" />, bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
  HIGH:     { icon: <ShieldAlert className="w-3.5 h-3.5" />, bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/20' },
  MEDIUM:   { icon: <AlertTriangle className="w-3.5 h-3.5" />, bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20' },
};

export const GraphSecurityPanel: React.FC<GraphSecurityPanelProps> = ({
  isOpen,
  onClose,
  nodes,
  edges,
  onHighlightNode,
  onOpenFile,
  autoRun = false,
}) => {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      // Collect file contents for nodes
      const fileContents: Record<string, string> = {};
      const seen = new Set<string>();
      for (const n of nodes) {
        const fp = n.data?.filepath;
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);
        try {
          const content = await getFileContent(fp);
          if (content) fileContents[fp] = content;
        } catch { /* skip */ }
      }

      const res = await fetch(`${BACKEND_URL}/security/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, file_contents: fileContents }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Scan failed: ${res.status}`);
      }

      setResult(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [nodes, edges]);

  // Auto-run when opened if requested
  useEffect(() => {
    if (isOpen && autoRun && !result && !scanning && nodes.length > 0) {
      runScan();
    }
  }, [isOpen, autoRun, nodes.length]);

  if (!isOpen) return null;

  const totalIssues = result?.total ?? 0;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Security Scanner</h3>
            <p className="text-[10px] text-white/50">Graph-aware OWASP rules</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {totalIssues > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20">
              {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={runScan}
            disabled={scanning}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Re-scan"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${scanning ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Scan button */}
        {!result && !scanning && !error && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <ShieldCheck className="w-10 h-10 text-white/10" />
            <button
              onClick={runScan}
              disabled={nodes.length === 0}
              className="px-5 py-2.5 rounded-lg text-[12px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/20 transition-colors disabled:opacity-40"
            >
              Run Security Scan
            </button>
            {nodes.length === 0 && (
              <p className="text-[10px] text-white/30">Analyze a project first</p>
            )}
          </div>
        )}

        {scanning && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-red-400" />
            <span className="text-[11px] text-white/40">Scanning {nodes.length} nodes...</span>
          </div>
        )}

        {error && !scanning && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-[12px] text-red-300">
            {error}
          </div>
        )}

        {result && !scanning && (
          <>
            {/* Severity summary */}
            <div className="grid grid-cols-3 gap-2">
              {(['CRITICAL', 'HIGH', 'MEDIUM'] as const).map((sev) => {
                const count = result.by_severity[sev] || 0;
                const cfg = SEVERITY_CONFIG[sev];
                return (
                  <div key={sev} className={`rounded-lg p-3 border ${cfg.bg} ${cfg.border}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cfg.text}>{cfg.icon}</span>
                      <span className={`text-[9px] font-bold uppercase ${cfg.text}`}>{sev}</span>
                    </div>
                    <div className={`text-[22px] font-bold font-mono ${cfg.text}`}>{count}</div>
                  </div>
                );
              })}
            </div>

            {totalIssues === 0 && (
              <div className="text-center py-8">
                <ShieldCheck className="w-10 h-10 text-green-400/30 mx-auto mb-3" />
                <p className="text-[13px] text-green-400/70 font-medium">No issues detected</p>
                <p className="text-[10px] text-white/30 mt-1">All 7 rules passed</p>
              </div>
            )}

            {/* Issues list */}
            {result.issues.map((issue, i) => {
              const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.MEDIUM;
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-3 space-y-2 ${cfg.bg} ${cfg.border}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={cfg.text}>{cfg.icon}</span>
                    <span className={`text-[9px] font-mono font-bold uppercase ${cfg.text}`}>
                      {issue.severity} — RULE {issue.rule}
                    </span>
                  </div>
                  <div className="text-[12px] font-medium text-white/80">{issue.title}</div>
                  <div className="text-[11px] text-white/50">{issue.description}</div>

                  <div className="flex items-center gap-2 pt-1">
                    {issue.node_id && (
                      <button
                        onClick={() => onHighlightNode?.(issue.node_id)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/50 transition-colors"
                      >
                        Highlight node
                      </button>
                    )}
                    {issue.filepath && (
                      <button
                        onClick={() => onOpenFile?.(issue.filepath, issue.line)}
                        className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/50 transition-colors"
                      >
                        <FileCode className="w-3 h-3" />
                        {issue.filepath.split('/').pop() || issue.filepath.split('\\').pop()}
                        {issue.line ? `:${issue.line}` : ''}
                        <ChevronRight className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

/** Badge for the nav bar showing issue count */
export const SecurityBadge: React.FC<{ count: number; onClick: () => void }> = ({ count, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors relative"
      style={{ color: count > 0 ? '#f87171' : 'var(--color-text-muted)' }}
      title={`Security: ${count} issue${count !== 1 ? 's' : ''}`}
    >
      <ShieldAlert className="w-3.5 h-3.5" />
      Security
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold bg-red-500 text-white">
          {count}
        </span>
      )}
    </button>
  );
};
