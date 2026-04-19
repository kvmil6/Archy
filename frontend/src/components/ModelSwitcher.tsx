/**
 * Compact model switcher for the canvas nav bar.
 *
 * Shows the active model as a pill. Clicking opens a dropdown with
 * all available models grouped by tier. Selecting a model updates
 * the global AI store immediately — no page reload needed.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Brain,
  ChevronDown,
  Check,
  Zap,
  DollarSign,
  Key,
  Server,
  X,
  Minus,
} from 'lucide-react';
import {
  BUILT_IN_MODELS,
  loadCustomModels,
  isOllamaEndpoint,
  type ModelEntry,
} from '@/services/modelRegistry';
import { useAIStore } from '@/store/useAIStore';

function fmtCtx(n: number): string {
  if (n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: '#f97316', OpenAI: '#10b981', Meta: '#6366f1',
  Moonshot: '#8b5cf6', Qwen: '#3b82f6', Google: '#ef4444', Custom: '#ec4899',
};

interface ModelSwitcherProps {
  /** Currently selected model id */
  value: string;
  /** Callback when model changes */
  onChange: (id: string) => void;
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasApiKey = useAIStore((s) => s.hasApiKey);

  const customModels = loadCustomModels();
  const allModels = [...BUILT_IN_MODELS, ...customModels];
  const activeModel = allModels.find((m) => m.id === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const select = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  const paid = BUILT_IN_MODELS.filter((m) => m.tier === 'paid');
  const free = BUILT_IN_MODELS.filter((m) => m.tier === 'free');

  return (
    <div className="relative" ref={ref}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border hover:border-white/20"
        style={{
          background: activeModel ? 'rgba(124,134,255,0.08)' : 'rgba(255,255,255,0.03)',
          borderColor: activeModel ? 'rgba(124,134,255,0.25)' : 'rgba(255,255,255,0.08)',
          color: activeModel ? '#a5abff' : 'var(--color-text-muted)',
        }}
      >
        <Brain className="w-3 h-3" />
        <span className="max-w-[120px] truncate">
          {activeModel ? activeModel.displayName : 'No AI'}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 w-[280px] rounded-xl border shadow-2xl overflow-hidden z-[9999]"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border-strong)',
            boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
          }}
        >
          <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
            {/* No AI option */}
            <ModelRow
              label="No AI — local only"
              description="Everything works without API key"
              isSelected={!value}
              onClick={() => select('')}
              icon={<Minus className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />}
            />

            {/* Paid */}
            <SectionLabel label="Paid" />
            {paid.map((m) => (
              <ModelRow
                key={m.id}
                label={m.displayName}
                description={m.description}
                provider={m.provider}
                contextWindow={m.contextWindow}
                isSelected={value === m.id}
                needsKey={m.tier === 'paid' && !hasApiKey}
                onClick={() => select(m.id)}
                badge={
                  m.tier === 'paid' && !hasApiKey
                    ? <Badge icon={<Key className="w-2 h-2" />} text="KEY" color="#fbbf24" />
                    : <Badge icon={<DollarSign className="w-2 h-2" />} text="PAID" color="#fbbf24" />
                }
              />
            ))}

            {/* Free */}
            <SectionLabel label="Free" />
            {free.map((m) => (
              <ModelRow
                key={m.id}
                label={m.displayName}
                description={m.description}
                provider={m.provider}
                contextWindow={m.contextWindow}
                isSelected={value === m.id}
                onClick={() => select(m.id)}
                badge={<Badge icon={<Zap className="w-2 h-2" />} text="FREE" color="#4ade80" />}
              />
            ))}

            {/* Custom */}
            {customModels.length > 0 && (
              <>
                <SectionLabel label="Your Models" />
                {customModels.map((m) => (
                  <ModelRow
                    key={m.id}
                    label={m.displayName}
                    description={m.endpoint || m.description}
                    provider={m.provider}
                    isSelected={value === m.id}
                    onClick={() => select(m.id)}
                    badge={
                      isOllamaEndpoint(m.endpoint)
                        ? <Badge icon={<Server className="w-2 h-2" />} text="OLLAMA" color="#06b6d4" />
                        : undefined
                    }
                  />
                ))}
              </>
            )}
          </div>

          <div className="border-t px-3 py-2 text-[9px] text-white/25 font-mono" style={{ borderColor: 'var(--color-border)' }}>
            Manage models from the home page
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[8px] font-bold uppercase tracking-[0.15em] px-2 pt-2 pb-0.5" style={{ color: 'var(--color-text-faint)' }}>
      {label}
    </div>
  );
}

function Badge({ icon, text, color }: { icon: React.ReactNode; text: string; color: string }) {
  return (
    <span
      className="flex items-center gap-0.5 text-[8px] font-mono font-bold px-1 py-0.5 rounded flex-shrink-0"
      style={{ background: `${color}15`, color }}
    >
      {icon}{text}
    </span>
  );
}

function ModelRow({
  label,
  description,
  provider,
  contextWindow,
  isSelected,
  needsKey,
  onClick,
  badge,
  icon,
}: {
  label: string;
  description: string;
  provider?: string;
  contextWindow?: number;
  isSelected: boolean;
  needsKey?: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const providerColor = provider ? PROVIDER_COLORS[provider] ?? '#6b7280' : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all group"
      style={{
        background: isSelected ? 'rgba(124,134,255,0.12)' : undefined,
      }}
    >
      {/* Provider dot or custom icon */}
      {icon ?? (
        <div
          className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
          style={{ background: providerColor ?? '#6b7280' }}
        >
          {provider?.charAt(0) ?? '?'}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium truncate" style={{ color: isSelected ? 'white' : 'var(--color-text)' }}>
            {label}
          </span>
          {contextWindow ? (
            <span className="text-[8px] font-mono px-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-faint)' }}>
              {fmtCtx(contextWindow)}
            </span>
          ) : null}
        </div>
        <div className="text-[9px] truncate" style={{ color: 'var(--color-text-faint)' }}>
          {description}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {badge}
        {isSelected && (
          <Check className="w-3 h-3" style={{ color: 'var(--color-accent)' }} strokeWidth={3} />
        )}
      </div>
    </button>
  );
}
