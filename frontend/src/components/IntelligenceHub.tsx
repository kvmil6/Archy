/**
 * Intelligence Hub — unified panel for advanced features.
 *
 * Tabs: Blast Radius | Dead Code | NL Query | Contracts | ADR | Refactor | Drift
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  Target,
  Skull,
  Search,
  FileCheck,
  FileText,
  Wrench,
  Radio,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Circle,
  Zap,
  Send,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { getFileContent } from '@/services/fileSystem';

// ── Types ────────────────────────────────────────────────────────────

type TabId = 'blast' | 'dead' | 'nlquery' | 'contracts' | 'adr' | 'refactor' | 'drift';

interface IntelligenceHubProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: any[];
  edges: any[];
  /** Pre-selected node for blast radius */
  blastTargetId?: string | null;
  /** Pre-selected tab */
  initialTab?: TabId;
  /** Focus a node on the canvas */
  onFocusNode?: (nodeId: string) => void;
  /** Highlight multiple nodes */
  onHighlightNodes?: (ids: string[]) => void;
  /** Latest diff data for ADR generation */
  latestDiff?: any;
  projectName?: string;
  healthScore?: number;
  model?: string;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'blast',     label: 'Blast Radius',  icon: <Target className="w-3 h-3" />,    color: '#ef4444' },
  { id: 'dead',      label: 'Dead Code',     icon: <Skull className="w-3 h-3" />,      color: '#8b5cf6' },
  { id: 'nlquery',   label: 'Ask Graph',     icon: <Search className="w-3 h-3" />,     color: '#3b82f6' },
  { id: 'contracts', label: 'Contracts',      icon: <FileCheck className="w-3 h-3" />,  color: '#06b6d4' },
  { id: 'adr',       label: 'ADR',           icon: <FileText className="w-3 h-3" />,   color: '#f59e0b' },
  { id: 'refactor',  label: 'Refactor',      icon: <Wrench className="w-3 h-3" />,     color: '#10b981' },
  { id: 'drift',     label: 'Drift',         icon: <Radio className="w-3 h-3" />,      color: '#ec4899' },
];

export const IntelligenceHub: React.FC<IntelligenceHubProps> = ({
  isOpen,
  onClose,
  nodes,
  edges,
  blastTargetId,
  initialTab = 'blast',
  onFocusNode,
  onHighlightNodes,
  latestDiff,
  projectName = 'Project',
  healthScore,
  model,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-white/10 bg-[#090b10]/95 shadow-2xl backdrop-blur-xl sm:w-[560px]">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-indigo-400/30 bg-indigo-500/10">
            <Zap className="h-4 w-4 text-indigo-300" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white">Intelligence Hub</div>
            <div className="text-[10px] tracking-wide text-white/40">Graph intelligence workspace</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-white/10">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[164px_minmax(0,1fr)]">
        {/* Tab rail */}
        <div className="overflow-y-auto border-r border-white/10 bg-white/[0.02] p-2.5">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="mb-1.5 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-all"
                style={{
                  color: active ? tab.color : 'rgba(255,255,255,0.62)',
                  borderColor: active ? `${tab.color}55` : 'rgba(255,255,255,0.08)',
                  background: active ? `${tab.color}16` : 'rgba(255,255,255,0.02)',
                  boxShadow: active ? `inset 0 0 0 1px ${tab.color}22` : undefined,
                }}
              >
                <span className="shrink-0">{tab.icon}</span>
                <span className="leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="min-w-0 overflow-y-auto">
          {activeTab === 'blast' && (
            <BlastRadiusTab
              nodes={nodes} edges={edges}
              targetId={blastTargetId}
              onFocusNode={onFocusNode}
              onHighlightNodes={onHighlightNodes}
            />
          )}
          {activeTab === 'dead' && (
            <DeadCodeTab nodes={nodes} edges={edges} onFocusNode={onFocusNode} onHighlightNodes={onHighlightNodes} />
          )}
          {activeTab === 'nlquery' && (
            <NLQueryTab nodes={nodes} edges={edges} onHighlightNodes={onHighlightNodes} onFocusNode={onFocusNode} />
          )}
          {activeTab === 'contracts' && (
            <ContractsTab nodes={nodes} edges={edges} onFocusNode={onFocusNode} />
          )}
          {activeTab === 'adr' && (
            <ADRTab diffData={latestDiff} projectName={projectName} healthScore={healthScore} />
          )}
          {activeTab === 'refactor' && (
            <RefactorTab nodes={nodes} edges={edges} model={model} />
          )}
          {activeTab === 'drift' && (
            <DriftTab />
          )}
        </div>
      </div>
    </div>
  );
};

// ── BLAST RADIUS TAB ─────────────────────────────────────────────────

const RING_COLORS: Record<string, { text: string; hex: string }> = {
  direct:     { text: 'text-red-400',        hex: '#ef4444' },
  transitive: { text: 'text-amber-400',      hex: '#f59e0b' },
  indirect:   { text: 'text-yellow-300/60',  hex: '#eab308' },
};

function BlastRadiusTab({ nodes, edges, targetId, onFocusNode, onHighlightNodes }: {
  nodes: any[]; edges: any[]; targetId?: string | null;
  onFocusNode?: (id: string) => void; onHighlightNodes?: (ids: string[]) => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(targetId || '');
  const [nodePickerOpen, setNodePickerOpen] = useState(false);
  const nodePickerRef = useRef<HTMLDivElement | null>(null);

  const selectedNodeLabel = nodes.find((n: any) => n.id === selectedNode)?.data?.label || selectedNode;

  const run = useCallback(async (nid: string) => {
    if (!nid) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/analyze/blast-radius`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nid, nodes, edges }),
      });
      const data = await res.json();
      setResult(data);
      if (onHighlightNodes) {
        const ids = (data.rings || []).flatMap((r: any) => r.nodes.map((n: any) => n.id));
        onHighlightNodes(ids);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [nodes, edges, onHighlightNodes]);

  useEffect(() => {
    if (targetId) {
      setSelectedNode(targetId);
      setNodePickerOpen(false);
      run(targetId);
    }
  }, [targetId]);

  useEffect(() => {
    if (!nodePickerOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (nodePickerRef.current && !nodePickerRef.current.contains(e.target as Node)) {
        setNodePickerOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [nodePickerOpen]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1" ref={nodePickerRef}>
          <button
            type="button"
            onClick={() => setNodePickerOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[11px] font-mono text-white outline-none transition-colors hover:border-white/20"
          >
            <span className={selectedNode ? 'truncate text-white/90' : 'truncate text-white/40'}>
              {selectedNode ? selectedNodeLabel : 'Select a node...'}
            </span>
            <ChevronRight className={`h-3.5 w-3.5 text-white/40 transition-transform ${nodePickerOpen ? 'rotate-90' : ''}`} />
          </button>

          {nodePickerOpen && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#10131b] p-1 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setSelectedNode('');
                  setNodePickerOpen(false);
                }}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
              >
                Select a node...
              </button>
              {nodes.map((n: any) => {
                const isActive = selectedNode === n.id;
                const label = n.data?.label || n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setSelectedNode(n.id);
                      setNodePickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] transition-colors"
                    style={{
                      background: isActive ? 'rgba(59,130,246,0.18)' : undefined,
                      color: isActive ? '#93c5fd' : 'rgba(255,255,255,0.78)',
                    }}
                  >
                    <span className="truncate">{label}</span>
                    {isActive && <Check className="h-3 w-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => run(selectedNode)}
          disabled={!selectedNode || loading}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/20 disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Analyze'}
        </button>
      </div>

      {result && !result.error && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(['direct', 'transitive', 'indirect'] as const).map((sev) => {
              const count = result.severity_summary?.[sev] || 0;
              const cfg = RING_COLORS[sev];
              return (
                <div key={sev} className="rounded-lg p-2.5 border border-white/5" style={{ background: `${cfg.hex}10` }}>
                  <div className={`text-[8px] font-bold uppercase ${cfg.text}`}>{sev}</div>
                  <div className={`text-[20px] font-bold font-mono ${cfg.text}`}>{count}</div>
                </div>
              );
            })}
          </div>
          {(result.rings || []).map((ring: any) => {
            const cfg = RING_COLORS[ring.severity] || RING_COLORS.indirect;
            return (
              <div key={ring.ring} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: cfg.hex }} />
                  <span className={`text-[9px] font-bold uppercase ${cfg.text}`}>Ring {ring.ring}</span>
                  <span className="text-[9px] text-white/30">{ring.nodes.length}</span>
                </div>
                {ring.nodes.map((n: any) => (
                  <button key={n.id} onClick={() => onFocusNode?.(n.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left">
                    <span className="text-[11px] text-white/80 truncate flex-1">{n.label}</span>
                    <span className="text-[8px] font-mono text-white/25">{n.type}</span>
                    <ChevronRight className="w-3 h-3 text-white/15" />
                  </button>
                ))}
              </div>
            );
          })}
          {result.total_affected === 0 && (
            <div className="text-center py-8">
              <Circle className="w-8 h-8 text-green-400/20 mx-auto mb-2" />
              <p className="text-[12px] text-green-400/50">No dependents — isolated node</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── DEAD CODE TAB ────────────────────────────────────────────────────

function DeadCodeTab({ nodes, edges, onFocusNode, onHighlightNodes }: {
  nodes: any[]; edges: any[];
  onFocusNode?: (id: string) => void; onHighlightNodes?: (ids: string[]) => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/intel/dead-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      });
      const data = await res.json();
      setResult(data);
      if (onHighlightNodes && data.dead_nodes) {
        onHighlightNodes(data.dead_nodes.map((n: any) => n.id));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [nodes, edges, onHighlightNodes]);

  return (
    <div className="p-4 space-y-3">
      <button onClick={run} disabled={loading || nodes.length === 0}
        className="w-full py-2 rounded-lg text-[12px] font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/20 disabled:opacity-40">
        {loading ? <Loader2 className="w-3 h-3 animate-spin inline mr-2" /> : <Skull className="w-3 h-3 inline mr-2" />}
        Scan for Dead Code
      </button>
      {result && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg p-3 border border-purple-500/15 bg-purple-500/10">
              <div className="text-[8px] font-bold uppercase text-purple-400">Dead nodes</div>
              <div className="text-[22px] font-bold font-mono text-purple-400">{result.total_dead}</div>
              <div className="text-[9px] text-white/30">{result.dead_percentage}% of graph</div>
            </div>
            <div className="rounded-lg p-3 border border-white/5 bg-white/5">
              <div className="text-[8px] font-bold uppercase text-white/40">Est. dead lines</div>
              <div className="text-[22px] font-bold font-mono text-white/60">{result.estimated_dead_lines}</div>
              <div className="text-[9px] text-white/30">{result.has_runtime_data ? 'static + runtime' : 'static only'}</div>
            </div>
          </div>
          {(result.dead_nodes || []).map((n: any) => (
            <button key={n.id} onClick={() => onFocusNode?.(n.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/10 bg-purple-500/5 hover:bg-purple-500/10 text-left">
              <Skull className="w-3 h-3 text-purple-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-white/80 truncate">{n.label}</div>
                <div className="text-[9px] text-white/30">{n.reason}</div>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                {Math.round(n.confidence * 100)}%
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ── NL QUERY TAB ─────────────────────────────────────────────────────

function NLQueryTab({ nodes, edges, onHighlightNodes, onFocusNode }: {
  nodes: any[]; edges: any[];
  onHighlightNodes?: (ids: string[]) => void; onFocusNode?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/intel/nl-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, nodes, edges }),
      });
      const data = await res.json();
      setResult(data);
      if (onHighlightNodes && data.matched_node_ids) {
        onHighlightNodes(data.matched_node_ids);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [query, nodes, edges, onHighlightNodes]);

  const examples = [
    'Show me all unused nodes',
    'Find circular dependencies',
    'Which nodes touch UserModel?',
    'Show the most connected hubs',
    'Find all route endpoints',
    'Show complex hotspots',
  ];

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          placeholder="Ask the graph anything..."
          className="flex-1 text-[12px] rounded-lg border px-3 py-2 bg-white/5 border-white/10 text-white outline-none placeholder:text-white/20 focus:border-blue-500/40"
          autoFocus
        />
        <button onClick={run} disabled={loading || !query.trim()}
          className="px-3 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/20 disabled:opacity-40">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!result && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-bold uppercase text-white/25 px-1">Try asking</div>
          {examples.map((ex) => (
            <button key={ex} onClick={() => { setQuery(ex); }}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors">
              "{ex}"
            </button>
          ))}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 p-3">
            <div className="text-[12px] text-blue-300 font-medium">{result.explanation}</div>
            <div className="text-[10px] text-white/30 mt-1">{result.count} node(s) matched</div>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {(result.matched_node_ids || []).map((id: string) => {
              const node = nodes.find((n: any) => n.id === id);
              return (
                <button key={id} onClick={() => onFocusNode?.(id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left">
                  <span className="text-[11px] text-white/70 truncate flex-1">{node?.data?.label || id}</span>
                  <span className="text-[8px] font-mono text-white/25">{node?.type || ''}</span>
                  <ChevronRight className="w-3 h-3 text-white/15" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CONTRACTS TAB ────────────────────────────────────────────────────

function ContractsTab({ nodes, edges, onFocusNode }: {
  nodes: any[]; edges: any[]; onFocusNode?: (id: string) => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const fileContents: Record<string, string> = {};
      const seen = new Set<string>();
      for (const n of nodes) {
        const fp = n.data?.filepath;
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);
        try { const c = await getFileContent(fp); if (c) fileContents[fp] = c; } catch { /* skip */ }
      }
      const res = await fetch(`${BACKEND_URL}/intel/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, file_contents: fileContents }),
      });
      setResult(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [nodes, edges]);

  const SEV: Record<string, { text: string; bg: string }> = {
    HIGH: { text: 'text-red-400', bg: 'bg-red-500/10' },
    MEDIUM: { text: 'text-amber-400', bg: 'bg-amber-500/10' },
    LOW: { text: 'text-blue-400', bg: 'bg-blue-500/10' },
  };

  return (
    <div className="p-4 space-y-3">
      <button onClick={run} disabled={loading || nodes.length === 0}
        className="w-full py-2 rounded-lg text-[12px] font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/20 disabled:opacity-40">
        {loading ? <Loader2 className="w-3 h-3 animate-spin inline mr-2" /> : <FileCheck className="w-3 h-3 inline mr-2" />}
        Validate Contracts
      </button>
      {result && (
        <>
          <div className="rounded-lg border border-white/5 bg-white/5 p-3 text-[11px] text-white/50">
            {result.routes_checked} routes checked · {result.total_issues} issues found
          </div>
          {(result.issues || []).map((issue: any, i: number) => {
            const s = SEV[issue.severity] || SEV.LOW;
            return (
              <div key={i} className={`rounded-lg border border-white/5 ${s.bg} p-3 space-y-1.5`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[8px] font-bold uppercase ${s.text}`}>{issue.severity}</span>
                  <span className="text-[9px] font-mono text-white/30">{issue.type}</span>
                </div>
                <div className="text-[11px] text-white/80">{issue.description}</div>
                <div className="text-[10px] text-white/30">{issue.suggestion}</div>
                {issue.node_id && (
                  <button onClick={() => onFocusNode?.(issue.node_id)}
                    className="text-[10px] text-cyan-400 hover:underline">Highlight node →</button>
                )}
              </div>
            );
          })}
          {result.total_issues === 0 && (
            <div className="text-center py-6 text-[12px] text-green-400/50">All contracts valid ✓</div>
          )}
        </>
      )}
    </div>
  );
}

// ── ADR TAB ──────────────────────────────────────────────────────────

function ADRTab({ diffData, projectName, healthScore }: {
  diffData?: any; projectName: string; healthScore?: number;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    if (!diffData) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/intel/adr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diff_data: diffData,
          project_name: projectName,
          health_before: healthScore,
          health_after: healthScore,
        }),
      });
      setResult(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [diffData, projectName, healthScore]);

  const copyMd = () => {
    if (result?.markdown) {
      navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 space-y-3">
      {!diffData ? (
        <div className="text-center py-12">
          <FileText className="w-8 h-8 text-white/10 mx-auto mb-3" />
          <p className="text-[12px] text-white/30">Run a Diff first to generate an ADR</p>
          <p className="text-[10px] text-white/20 mt-1">Use the Diff tab to compare snapshots</p>
        </div>
      ) : (
        <>
          <button onClick={generate} disabled={loading}
            className="w-full py-2 rounded-lg text-[12px] font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/20 disabled:opacity-40">
            {loading ? <Loader2 className="w-3 h-3 animate-spin inline mr-2" /> : <FileText className="w-3 h-3 inline mr-2" />}
            Generate ADR
          </button>
          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/30">ADR-{String(result.adr_number).padStart(4, '0')}</span>
                <button onClick={copyMd}
                  className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy markdown'}
                </button>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-[11px] text-white/70 font-mono whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                {result.markdown}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── REFACTOR TAB ─────────────────────────────────────────────────────

function RefactorTab({ nodes, edges, model }: { nodes: any[]; edges: any[]; model?: string }) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async () => {
    setLoading(true);
    // Client-side analysis of graph structure for refactoring suggestions
    const suggs: any[] = [];

    // Build adjacency
    const incoming: Record<string, number> = {};
    const outgoing: Record<string, number> = {};
    for (const e of edges) {
      const s = e.source || '';
      const t = e.target || '';
      outgoing[s] = (outgoing[s] || 0) + 1;
      incoming[t] = (incoming[t] || 0) + 1;
    }

    for (const n of nodes) {
      const id = n.id;
      const data = n.data || {};
      const label = data.label || id;
      const totalEdges = (incoming[id] || 0) + (outgoing[id] || 0);

      // God nodes (too many connections)
      if (totalEdges >= 8) {
        suggs.push({
          type: 'split_module',
          severity: 'HIGH',
          node: label,
          nodeId: id,
          title: `Split "${label}" — ${totalEdges} connections`,
          description: `This module has ${incoming[id] || 0} dependents and ${outgoing[id] || 0} dependencies. Consider extracting cohesive subgroups into separate modules.`,
          impact: `Reduces coupling by ~${Math.round(totalEdges * 0.4)} edges`,
        });
      }

      // Deep dependency chains
      if ((outgoing[id] || 0) >= 6) {
        suggs.push({
          type: 'extract_facade',
          severity: 'MEDIUM',
          node: label,
          nodeId: id,
          title: `Extract facade for "${label}"`,
          description: `Imports ${outgoing[id]} modules directly. Introduce a facade/service layer to reduce direct coupling.`,
          impact: 'Simplifies the dependency tree',
        });
      }
    }

    // Detect potential circular dependencies
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const adj: Record<string, string[]> = {};
    for (const e of edges) adj[e.source] = [...(adj[e.source] || []), e.target];

    function hasCycle(node: string): boolean {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      recStack.add(node);
      for (const nb of adj[node] || []) {
        if (hasCycle(nb)) return true;
      }
      recStack.delete(node);
      return false;
    }

    for (const n of nodes) {
      if (hasCycle(n.id)) {
        const label = n.data?.label || n.id;
        suggs.push({
          type: 'break_cycle',
          severity: 'HIGH',
          node: label,
          nodeId: n.id,
          title: `Break circular dependency involving "${label}"`,
          description: 'Part of a dependency cycle. Extract shared interfaces or use dependency inversion.',
          impact: 'Eliminates circular dependency',
        });
        break; // One suggestion per cycle group
      }
    }

    suggs.sort((a, b) => {
      const ord: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (ord[a.severity] || 2) - (ord[b.severity] || 2);
    });

    setSuggestions(suggs);
    setLoading(false);
  }, [nodes, edges]);

  const SEV: Record<string, string> = { HIGH: 'text-red-400', MEDIUM: 'text-amber-400', LOW: 'text-blue-400' };

  return (
    <div className="p-4 space-y-3">
      <button onClick={analyze} disabled={loading || nodes.length === 0}
        className="w-full py-2 rounded-lg text-[12px] font-medium bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/20 disabled:opacity-40">
        {loading ? <Loader2 className="w-3 h-3 animate-spin inline mr-2" /> : <Wrench className="w-3 h-3 inline mr-2" />}
        Analyze Refactoring Opportunities
      </button>
      {suggestions.length > 0 && (
        <div className="text-[10px] text-white/30">{suggestions.length} suggestion(s)</div>
      )}
      {suggestions.map((s, i) => (
        <div key={i} className="rounded-lg border border-white/5 bg-white/[0.03] p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[8px] font-bold uppercase ${SEV[s.severity] || 'text-white/40'}`}>{s.severity}</span>
            <span className="text-[9px] font-mono text-white/20">{s.type}</span>
          </div>
          <div className="text-[12px] font-medium text-white/80">{s.title}</div>
          <div className="text-[10px] text-white/40">{s.description}</div>
          <div className="text-[10px] text-green-400/60 font-mono">{s.impact}</div>
        </div>
      ))}
      {suggestions.length === 0 && !loading && (
        <div className="text-center py-8 text-[11px] text-white/20">Click analyze to get suggestions</div>
      )}
    </div>
  );
}

// ── DRIFT TAB ────────────────────────────────────────────────────────

function DriftTab() {
  return (
    <div className="p-4 space-y-3">
      <div className="text-center py-12">
        <Radio className="w-8 h-8 text-pink-400/20 mx-auto mb-3" />
        <p className="text-[13px] font-medium text-white/40">Dependency Drift Detection</p>
        <p className="text-[10px] text-white/25 mt-2 max-w-[280px] mx-auto">
          Enable file watching to get real-time alerts when new dependencies cross module boundaries or create cycles.
        </p>
        <div className="mt-4 px-4 py-2.5 rounded-lg border border-pink-500/15 bg-pink-500/5 text-[11px] text-pink-300/60">
          Coming with <code className="bg-white/10 px-1 rounded text-[10px]">watchfiles</code> integration
        </div>
      </div>
    </div>
  );
}
