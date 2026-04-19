import React, { useState, useEffect } from 'react';
import { Check, Plus, X, Minus, Zap, DollarSign } from 'lucide-react';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  isFree?: boolean;
  isCustom?: boolean;
}

const PRESET_MODELS: ModelOption[] = [
  { id: 'anthropic/claude-3.5-sonnet',      name: 'Claude 3.5 Sonnet',   provider: 'Anthropic', isFree: false },
  { id: 'openai/gpt-4o',                    name: 'GPT-4o',              provider: 'OpenAI',    isFree: false },
  { id: 'moonshotai/kimi-k2.5',             name: 'Kimi K2.5',           provider: 'Moonshot',  isFree: true  },
  { id: 'qwen/qwen3-coder:free',            name: 'Qwen3 Coder',         provider: 'Qwen',      isFree: true  },
  { id: 'google/gemma-4-31b-it:free',       name: 'Gemma 4 31B',         provider: 'Google',    isFree: true  },
  { id: 'meta-llama/llama-3.1-405b',        name: 'Llama 3.1 405B',      provider: 'Meta',      isFree: false },
];

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Deselectable model selector.
 * - Click a model to select it
 * - Click the same model again (or the "None" option) to deselect (AI off)
 * - onChange('') means AI disabled
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange }) => {
  const [customModel, setCustomModel] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [savedCustom, setSavedCustom] = useState<ModelOption[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('archy_custom_models');
    if (saved) {
      try {
        setSavedCustom(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleAddCustom = () => {
    if (!customModel.trim()) return;
    const [provider, name] = customModel.split('/');
    const newModel: ModelOption = {
      id: customModel.trim(),
      name: (name ?? customModel).replace(':free', '').trim(),
      provider: provider?.trim() || 'Custom',
      isCustom: true,
      isFree: customModel.includes(':free'),
    };
    const updated = [...savedCustom, newModel];
    setSavedCustom(updated);
    localStorage.setItem('archy_custom_models', JSON.stringify(updated));
    onChange(newModel.id);
    setCustomModel('');
    setShowCustom(false);
  };

  const handleToggle = (modelId: string) => {
    // Deselect if clicking the current selection
    onChange(value === modelId ? '' : modelId);
  };

  const allModels = [...PRESET_MODELS, ...savedCustom];
  const aiDisabled = !value;

  return (
    <div className="space-y-1.5">
      {/* "AI Disabled" option */}
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

      {/* Model options */}
      {allModels.map((model) => {
        const isSelected = value === model.id;
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
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: isSelected ? 'var(--color-accent)' : 'transparent',
                border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
              }}
            >
              {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </div>

            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                  {model.name}
                  {model.isCustom && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded" 
                          style={{ background: 'rgba(244,114,182,0.15)', color: '#f472b6' }}>
                      CUSTOM
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {model.id}
                </div>
              </div>
              
              <div className="flex-shrink-0 flex items-center gap-1">
                {model.isFree ? (
                  <span className="flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                    <Zap className="w-2.5 h-2.5" />
                    FREE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                    <DollarSign className="w-2.5 h-2.5" />
                    PAID
                  </span>
                )}
                {isSelected && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange('');
                    }}
                    className="ml-1 w-4 h-4 rounded-full flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors"
                    title="Deselect"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        onChange('');
                      }
                    }}
                  >
                    <X className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} />
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {/* Custom model entry */}
      <div className="pt-1">
        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="flex items-center gap-1.5 text-[11px] font-mono transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Plus className="w-3 h-3" />
            ADD CUSTOM MODEL
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
              placeholder="provider/model-name"
              className="flex-1 text-[12px] font-mono px-3 py-2 rounded-md border outline-none focus:border-[var(--color-accent)] transition-colors"
              style={{
                background: 'var(--color-bg-subtle)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              autoFocus
            />
            <button
              onClick={handleAddCustom}
              disabled={!customModel.trim()}
              className="px-3 py-2 rounded-md text-[12px] font-medium disabled:opacity-40 transition-all"
              style={{
                background: 'var(--color-accent)',
                color: 'white',
              }}
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowCustom(false);
                setCustomModel('');
              }}
              className="px-2 py-2 rounded-md text-[12px] hover:bg-white/5 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
