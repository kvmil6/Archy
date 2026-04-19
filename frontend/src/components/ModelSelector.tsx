import React, { useState, useEffect, useCallback } from 'react';
import { Check, Plus, X, Minus, Zap, DollarSign, Key, Server, Trash2, AlertCircle } from 'lucide-react';
import {
  BUILT_IN_MODELS,
  loadCustomModels,
  addCustomModel,
  removeCustomModel,
  isOllamaEndpoint,
  type ModelEntry,
} from '@/services/modelRegistry';
import { useAIStore } from '@/store/useAIStore';

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Format context window numbers like "200K" */
function fmtCtx(n: number): string {
  if (n <= 0) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Provider initial badge (first letter, coloured) */
const ProviderBadge: React.FC<{ provider: string }> = ({ provider }) => {
  const colors: Record<string, string> = {
    Anthropic: '#f97316', OpenAI: '#10b981', Meta: '#6366f1',
    Moonshot: '#8b5cf6', Qwen: '#3b82f6', Google: '#ef4444', Custom: '#ec4899',
  };
  const bg = colors[provider] ?? '#6b7280';
  return (
    <div
      className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
      style={{ background: bg }}
    >
      {provider.charAt(0)}
    </div>
  );
};

/** Token usage bar for a model */
const UsageBar: React.FC<{ modelId: string; contextWindow: number }> = ({ modelId, contextWindow }) => {
  const usage = useAIStore((s) => s.tokenUsage[modelId]);
  if (!usage) return null;
  const total = usage.inputTokens + usage.outputTokens;
  if (total === 0) return null;
  const limit = contextWindow > 0 ? contextWindow : 200_000;
  const pct = Math.min(100, (total / limit) * 100);
  const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#6366f1';
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
        {total.toLocaleString()} / {fmtCtx(limit)}
      </span>
    </div>
  );
};

/**
 * Rich model selector panel.
 * Sections: Paid / Free / Your Models.
 * Badges: FREE, KEY REQUIRED, OLLAMA.
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange }) => {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customModels, setCustomModels] = useState<ModelEntry[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<Record<string, 'ok' | 'fail' | 'pending'>>({});

  // Custom model form fields
  const [formName, setFormName] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [formModelId, setFormModelId] = useState('');
  const [formApiKey, setFormApiKey] = useState('');

  const hasApiKey = useAIStore((s) => s.hasApiKey);

  useEffect(() => {
    setCustomModels(loadCustomModels());
  }, []);

  const handleToggle = (modelId: string) => {
    onChange(value === modelId ? '' : modelId);
  };

  const handleAddCustom = () => {
    if (!formName.trim() || !formEndpoint.trim() || !formModelId.trim()) return;
    const newModel = addCustomModel({
      name: formName.trim(),
      endpoint: formEndpoint.trim(),
      modelId: formModelId.trim(),
      apiKey: formApiKey.trim() || undefined,
    });
    setCustomModels(loadCustomModels());
    onChange(newModel.id);
    setFormName('');
    setFormEndpoint('');
    setFormModelId('');
    setFormApiKey('');
    setShowCustomForm(false);
  };

  const handleRemoveCustom = (id: string) => {
    removeCustomModel(id);
    setCustomModels(loadCustomModels());
    if (value === id) onChange('');
  };

  // Ping Ollama when a custom model with Ollama endpoint is selected
  const pingOllama = useCallback(async (endpoint: string, modelId: string) => {
    setOllamaStatus((prev) => ({ ...prev, [modelId]: 'pending' }));
    try {
      const url = endpoint.replace(/\/+$/, '');
      const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(3000) });
      setOllamaStatus((prev) => ({ ...prev, [modelId]: res.ok ? 'ok' : 'fail' }));
    } catch {
      setOllamaStatus((prev) => ({ ...prev, [modelId]: 'fail' }));
    }
  }, []);

  useEffect(() => {
    if (!value) return;
    const model = [...BUILT_IN_MODELS, ...customModels].find((m) => m.id === value);
    if (model?.endpoint && isOllamaEndpoint(model.endpoint)) {
      pingOllama(model.endpoint, model.id);
    }
  }, [value, customModels, pingOllama]);

  const paidModels = BUILT_IN_MODELS.filter((m) => m.tier === 'paid');
  const freeModels = BUILT_IN_MODELS.filter((m) => m.tier === 'free');
  const aiDisabled = !value;

  const renderModelRow = (model: ModelEntry) => {
    const isSelected = value === model.id;
    const isOllama = isOllamaEndpoint(model.endpoint);
    const needsKey = model.tier === 'paid' && !hasApiKey;

    return (
      <button
        key={model.id}
        type="button"
        onClick={() => handleToggle(model.id)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all border group"
        style={{
          background: isSelected ? 'var(--color-accent-dim)' : 'var(--color-bg-subtle)',
          borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
        }}
      >
        {/* Radio dot */}
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: isSelected ? 'var(--color-accent)' : 'transparent',
            border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
          }}
        >
          {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        </div>

        <ProviderBadge provider={model.provider} />

        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
            {model.displayName}
            {model.contextWindow > 0 && (
              <span className="text-[9px] font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                {fmtCtx(model.contextWindow)}
              </span>
            )}
          </div>
          <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
            {model.description}
          </div>
          <UsageBar modelId={model.id} contextWindow={model.contextWindow} />
        </div>

        <div className="flex-shrink-0 flex items-center gap-1">
          {model.tier === 'free' && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
              <Zap className="w-2.5 h-2.5" />
              FREE
            </span>
          )}
          {needsKey && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
              <Key className="w-2.5 h-2.5" />
              KEY
            </span>
          )}
          {isOllama && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4' }}>
              <Server className="w-2.5 h-2.5" />
              OLLAMA
            </span>
          )}
          {model.tier === 'paid' && !needsKey && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
              <DollarSign className="w-2.5 h-2.5" />
              PAID
            </span>
          )}
          {model.tier === 'custom' && !isOllama && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveCustom(model.id); }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Remove custom model"
            >
              <Trash2 className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          )}
          {isSelected && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors"
              title="Deselect"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
            >
              <X className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} />
            </span>
          )}
        </div>
      </button>
    );
  };

  // Ollama warning
  const selectedModel = [...BUILT_IN_MODELS, ...customModels].find((m) => m.id === value);
  const ollamaFail = selectedModel && isOllamaEndpoint(selectedModel.endpoint) && ollamaStatus[selectedModel.id] === 'fail';
  const paidNoKey = selectedModel && selectedModel.tier === 'paid' && !hasApiKey;

  return (
    <div className="space-y-3">
      {/* Warning banners */}
      {paidNoKey && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md text-[11px]"
             style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
          <Key className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Add your OpenRouter key in Settings to use this model.</span>
        </div>
      )}
      {ollamaFail && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md text-[11px]"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Ollama doesn't seem to be running. Start it with: <code className="bg-white/10 px-1 rounded">ollama serve</code></span>
        </div>
      )}

      {/* AI Disabled option */}
      <button
        type="button"
        onClick={() => onChange('')}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all border"
        style={{
          background: aiDisabled ? 'var(--color-accent-dim)' : 'var(--color-bg-subtle)',
          borderColor: aiDisabled ? 'var(--color-accent)' : 'var(--color-border)',
        }}
      >
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: aiDisabled ? 'var(--color-accent)' : 'transparent',
            border: `1.5px solid ${aiDisabled ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
          }}
        >
          {aiDisabled && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        </div>
        <Minus className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium">No AI — local parsing only</div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Everything works without API key
          </div>
        </div>
      </button>

      {/* ── Paid Models ── */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-widest mb-1.5 px-1" style={{ color: 'var(--color-text-muted)' }}>
          Paid
        </div>
        <div className="space-y-1">
          {paidModels.map(renderModelRow)}
        </div>
      </div>

      {/* ── Free Models ── */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-widest mb-1.5 px-1" style={{ color: 'var(--color-text-muted)' }}>
          Free
        </div>
        <div className="space-y-1">
          {freeModels.map(renderModelRow)}
        </div>
      </div>

      {/* ── Your Models ── */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-widest mb-1.5 px-1" style={{ color: 'var(--color-text-muted)' }}>
          Your Models
        </div>
        <div className="space-y-1">
          {customModels.length > 0
            ? customModels.map(renderModelRow)
            : (
              <div className="text-[10px] px-3 py-2 rounded-md" style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-subtle)' }}>
                No custom models yet. Add Ollama or any OpenAI-compatible endpoint.
              </div>
            )}
        </div>

        {/* Add custom model button / form */}
        <div className="pt-1.5">
          {!showCustomForm ? (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="flex items-center gap-1.5 text-[11px] font-mono transition-colors hover:opacity-80"
              style={{ color: 'var(--color-accent)' }}
            >
              <Plus className="w-3 h-3" />
              ADD CUSTOM MODEL
            </button>
          ) : (
            <div className="rounded-md border p-3 space-y-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Display name (e.g. My Llama)"
                className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded border outline-none focus:border-[var(--color-accent)] transition-colors"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                autoFocus
              />
              <input
                type="text"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                placeholder="Endpoint (e.g. http://localhost:11434/v1)"
                className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded border outline-none focus:border-[var(--color-accent)] transition-colors"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <input
                type="text"
                value={formModelId}
                onChange={(e) => setFormModelId(e.target.value)}
                placeholder="Model ID (e.g. llama3.2)"
                className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded border outline-none focus:border-[var(--color-accent)] transition-colors"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="API key (optional — leave blank for Ollama)"
                className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded border outline-none focus:border-[var(--color-accent)] transition-colors"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddCustom}
                  disabled={!formName.trim() || !formEndpoint.trim() || !formModelId.trim()}
                  className="flex-1 py-1.5 rounded text-[12px] font-medium disabled:opacity-40 transition-all"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  Add Model
                </button>
                <button
                  onClick={() => { setShowCustomForm(false); setFormName(''); setFormEndpoint(''); setFormModelId(''); setFormApiKey(''); }}
                  className="px-3 py-1.5 rounded text-[12px] hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
