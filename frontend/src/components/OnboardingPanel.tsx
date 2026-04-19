/**
 * Part 4 — Onboarding Panel.
 *
 * AI-generated guided tour of the project architecture.
 * Tabs: Overview | Request flow | Core models | Top files
 * Cached in localStorage per project hash.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  BookOpen,
  Loader2,
  RefreshCw,
  ArrowRight,
  FileCode,
  Layers,
  Route,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';

// ── Types ───────────────────────────────────────────────────────────

interface OnboardingData {
  summary: string;
  top_files: { path: string; reason: string }[];
  request_flow: { step: number; node: string; description: string }[];
  core_models: { name: string; purpose: string; key_fields: string[] }[];
  start_here: string;
}

interface OnboardingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active AI model id */
  model?: string;
  /** Graph nodes for context */
  nodes: any[];
  edges: any[];
  framework?: string;
  projectPath?: string;
  /** Pan to a node on the canvas */
  onFocusNode?: (nodeNameOrId: string) => void;
  /** Open a file in the canvas editor */
  onOpenFile?: (filepath: string) => void;
}

type Tab = 'overview' | 'flow' | 'models' | 'files';

function getFriendlyAIError(status?: number, detail?: string): string {
  const text = String(detail || '').toLowerCase();
  if (status === 400 || text.includes('not configured')) {
    return 'OpenRouter API key is not configured. Add it in settings first.';
  }
  if (status === 401 || status === 403 || text.includes('api key')) {
    return 'OpenRouter rejected the API key. Verify backend/.env and try again.';
  }
  if (status === 402 || text.includes('payment required') || text.includes('billing')) {
    return 'OpenRouter billing issue (Payment Required). Add credits or switch to a free model.';
  }
  if (status === 429 || text.includes('rate limit')) {
    return 'OpenRouter rate limit reached. Wait a moment and retry.';
  }
  if (status === 504 || text.includes('timed out')) {
    return 'AI request timed out. Try a shorter prompt.';
  }
  if (status === 502 || text.includes('model not found')) {
    return detail || 'Selected model is unavailable. Choose a different model and retry.';
  }
  return detail || 'AI request failed. Please try again.';
}

function projectHash(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  }
  return `archy_onboarding_${Math.abs(h).toString(36)}`;
}

export const OnboardingPanel: React.FC<OnboardingPanelProps> = ({
  isOpen,
  onClose,
  model,
  nodes,
  edges,
  framework = 'unknown',
  projectPath = '',
  onFocusNode,
  onOpenFile,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = projectHash(projectPath);

  // Load from cache or generate
  useEffect(() => {
    if (!isOpen) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setData(JSON.parse(cached));
        return;
      } catch { /* regenerate */ }
    }
    if (model && nodes.length > 0 && !data && !loading) {
      generate();
    }
  }, [isOpen, cacheKey]);

  const generate = useCallback(async () => {
    if (!model) {
      setError('Select an AI model first');
      return;
    }
    setLoading(true);
    setError(null);

    // Build a compact graph summary for the AI
    const nodesSummary = nodes.slice(0, 60).map((n: any) => ({
      id: n.id,
      type: n.type,
      label: n.data?.label,
      filepath: n.data?.filepath,
    }));
    const edgesSummary = edges.slice(0, 100).map((e: any) => ({
      source: e.source,
      target: e.target,
    }));

    const systemPrompt = `You are Archy's onboarding assistant. Given a Python ${framework} project's architecture graph, generate a structured onboarding guide for new developers. Return ONLY valid JSON matching this schema:
{
  "summary": "2-3 sentence project description",
  "top_files": [{"path": "...", "reason": "why read this first"}],
  "request_flow": [{"step": 1, "node": "node_name", "description": "..."}],
  "core_models": [{"name": "...", "purpose": "...", "key_fields": ["field1", "field2"]}],
  "start_here": "1-paragraph advice for a new developer"
}`;

    const userPrompt = `Here is the architecture graph:
Nodes (${nodes.length} total, showing first 60): ${JSON.stringify(nodesSummary)}
Edges (${edges.length} total, showing first 100): ${JSON.stringify(edgesSummary)}
Framework: ${framework}
Generate the onboarding guide.`;

    try {
      const res = await fetch(`${BACKEND_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(getFriendlyAIError(res.status, payload?.detail));
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let fullText = '';
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            const parsed = JSON.parse(d);
            if (parsed.error) {
              streamError = getFriendlyAIError(parsed.status_code, String(parsed.error));
              break;
            }
            if (parsed.type === 'usage') continue;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullText += delta;
          } catch { /* skip */ }
        }
        if (streamError) break;
      }

      if (streamError) {
        throw new Error(streamError);
      }

      // Parse JSON from response (may have markdown fences)
      let cleaned = fullText.trim();
      if (cleaned.startsWith('```')) {
        const firstNl = cleaned.indexOf('\n');
        cleaned = cleaned.slice(firstNl + 1);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3).trimEnd();
      }

      const parsed: OnboardingData = JSON.parse(cleaned);
      setData(parsed);
      localStorage.setItem(cacheKey, JSON.stringify(parsed));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [model, nodes, edges, framework, cacheKey]);

  const regenerate = () => {
    localStorage.removeItem(cacheKey);
    setData(null);
    generate();
  };

  if (!isOpen) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { key: 'flow', label: 'Request flow', icon: <Route className="w-3.5 h-3.5" /> },
    { key: 'models', label: 'Core models', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'files', label: 'Top files', icon: <FileCode className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Onboarding</h3>
            <p className="text-[10px] text-white/50">AI-generated project tour</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={regenerate}
            disabled={loading}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Regenerate"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-surface-800/30 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium transition-colors relative"
            style={{ color: tab === t.key ? 'white' : 'var(--color-text-muted)' }}
          >
            {t.icon}
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--color-accent)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span className="text-[11px] text-white/40">Generating onboarding guide...</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-[12px] text-red-300 space-y-2">
            <div>{error}</div>
            {model && (
              <button onClick={generate} className="text-[11px] underline text-red-300/70 hover:text-red-300">
                Try again
              </button>
            )}
          </div>
        )}

        {!loading && !error && !data && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <BookOpen className="w-10 h-10 text-white/10" />
            <div className="text-center space-y-2">
              <p className="text-[12px] text-white/50">No onboarding data yet</p>
              {model ? (
                <button
                  onClick={generate}
                  className="px-4 py-2 rounded-lg text-[12px] font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/20 transition-colors"
                >
                  Generate guided tour
                </button>
              ) : (
                <p className="text-[11px] text-white/30">Select an AI model first</p>
              )}
            </div>
          </div>
        )}

        {!loading && data && tab === 'overview' && (
          <div className="space-y-5">
            <div className="text-[13px] text-white/80 leading-relaxed">{data.summary}</div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-[12px] font-semibold text-amber-300">Start here</span>
              </div>
              <p className="text-[12px] text-white/70 leading-relaxed">{data.start_here}</p>
            </div>
          </div>
        )}

        {!loading && data && tab === 'flow' && (
          <div className="space-y-3">
            {data.request_flow.map((step) => (
              <button
                key={step.step}
                type="button"
                onClick={() => onFocusNode?.(step.node)}
                className="w-full text-left bg-surface-800/40 rounded-xl border border-white/5 p-3 hover:border-white/15 transition-colors space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center flex-shrink-0">
                    {step.step}
                  </span>
                  <span className="text-[12px] font-semibold text-white/80">{step.node}</span>
                  <ChevronRight className="w-3 h-3 text-white/20 ml-auto" />
                </div>
                <p className="text-[11px] text-white/50 pl-7">{step.description}</p>
              </button>
            ))}
          </div>
        )}

        {!loading && data && tab === 'models' && (
          <div className="space-y-3">
            {data.core_models.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => onFocusNode?.(m.name)}
                className="w-full text-left bg-surface-800/40 rounded-xl border border-white/5 p-3 hover:border-white/15 transition-colors space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[12px] font-semibold text-white/80">{m.name}</span>
                  <ChevronRight className="w-3 h-3 text-white/20 ml-auto" />
                </div>
                <p className="text-[11px] text-white/50">{m.purpose}</p>
                {m.key_fields.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {m.key_fields.map((f) => (
                      <span key={f} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {!loading && data && tab === 'files' && (
          <div className="space-y-2">
            {data.top_files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => onOpenFile?.(f.path)}
                className="w-full text-left bg-surface-800/40 rounded-xl border border-white/5 p-3 hover:border-white/15 transition-colors space-y-1"
              >
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-[11px] font-mono text-white/70 truncate">{f.path}</span>
                  <ArrowRight className="w-3 h-3 text-white/20 ml-auto flex-shrink-0" />
                </div>
                <p className="text-[10px] text-white/40 pl-6">{f.reason}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
