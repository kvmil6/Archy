/**
 * Typed model registry for Archy AI.
 *
 * Every model entry carries: id, displayName, provider, tier, contextWindow, description.
 * Custom models are persisted in localStorage under "archy_custom_models".
 */

export type ModelTier = 'paid' | 'free' | 'custom';

export interface ModelPricing {
  /** Human-friendly label used by tooltips and compare views */
  label: string;
  /** USD per 1M input tokens */
  inputPricePerMUsd?: number;
  /** USD per 1M output tokens */
  outputPricePerMUsd?: number;
}

export interface ModelCompareMetadata {
  releaseDate: string;
  pricingLabel: string;
  tags: string[];
  recommended?: boolean;
}

export interface ModelEntry {
  id: string;
  /** Canonical model name for compare cards and exports */
  name?: string;
  displayName: string;
  provider: string;
  tier: ModelTier;
  contextWindow: number;
  description: string;
  pricing?: ModelPricing;
  releaseDate?: string;
  tags?: string[];
  recommended?: boolean;
  compareMetadata?: ModelCompareMetadata;
  /** Full URL override (e.g. http://localhost:11434/v1) — only for custom/Ollama models */
  endpoint?: string;
  /** Model string sent in the API request — only for custom models */
  modelId?: string;
  /** Optional API key override — only for custom models */
  apiKey?: string;
}

export const DEFAULT_FREE_MODEL_ID = 'qwen/qwen3-coder:free';
export const DEFAULT_PAID_MODEL_ID = 'anthropic/claude-opus-4.7';
export const DEFAULT_MODEL_ID = DEFAULT_PAID_MODEL_ID;

function withCompareMetadata(model: ModelEntry): ModelEntry {
  const pricingLabel = model.pricing?.label || (model.tier === 'free' ? 'Free' : 'Paid');
  return {
    ...model,
    compareMetadata: {
      releaseDate: model.releaseDate || '1970-01-01',
      pricingLabel,
      tags: model.tags || [],
      recommended: model.recommended,
    },
  };
}

// ── Built-in models ─────────────────────────────────────────────────

export const BUILT_IN_MODELS: ModelEntry[] = ([
  // ── Paid (newest first) ────────────────────────────────────────────
  {
    id: 'anthropic/claude-opus-4.7',
    name: 'Claude Opus 4.7',
    displayName: 'Claude Opus 4.7',
    provider: 'Anthropic',
    tier: 'paid',
    contextWindow: 1_000_000,
    description: 'Highest-quality Anthropic model for deep architecture and coding work',
    pricing: {
      label: '$5/M input / $25/M output',
      inputPricePerMUsd: 5,
      outputPricePerMUsd: 25,
    },
    releaseDate: '2026-04-16',
    tags: ['chat', 'premium', 'best-quality', 'long-context'],
    recommended: true,
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    displayName: 'Gemini 3.1 Pro',
    provider: 'Google',
    tier: 'paid',
    contextWindow: 1_048_576,
    description: 'Large-context multimodal model with strong speed/quality balance',
    pricing: {
      label: '$2/M input / $12/M output',
      inputPricePerMUsd: 2,
      outputPricePerMUsd: 12,
    },
    releaseDate: '2026-02-19',
    tags: ['chat', 'multimodal', 'fast'],
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tier: 'paid',
    contextWindow: 1_000_000,
    description: 'Balanced high-context model for daily architecture and coding workloads',
    pricing: {
      label: '$3/M input / $15/M output',
      inputPricePerMUsd: 3,
      outputPricePerMUsd: 15,
    },
    releaseDate: '2026-02-17',
    tags: ['chat', 'balanced', 'long-context'],
  },

  // ── Free (newest first) ────────────────────────────────────────────
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B Instruct',
    displayName: 'Gemma 4 31B',
    provider: 'Google',
    tier: 'free',
    contextWindow: 262_144,
    description: 'Lightweight free model with improved long-context handling',
    pricing: { label: 'Free' },
    releaseDate: '2026-04-02',
    tags: ['free', 'lightweight'],
  },
  {
    id: 'minimax/minimax-m2.5:free',
    name: 'MiniMax M2.5',
    displayName: 'MiniMax M2.5',
    provider: 'MiniMax',
    tier: 'free',
    contextWindow: 196_608,
    description: 'Fast free model for interactive architecture exploration',
    pricing: { label: 'Free' },
    releaseDate: '2026-02-12',
    tags: ['free', 'fast'],
  },
  {
    id: 'openai/gpt-oss-120b:free',
    name: 'GPT-OSS 120B',
    displayName: 'GPT-OSS 120B',
    provider: 'OpenAI',
    tier: 'free',
    contextWindow: 131_072,
    description: 'Large free model with strong general reasoning and local-friendly behavior',
    pricing: { label: 'Free' },
    releaseDate: '2025-08-05',
    tags: ['free', 'large', 'offline-capable'],
    recommended: true,
  },
  {
    id: 'qwen/qwen3-coder:free',
    name: 'Qwen3 Coder',
    displayName: 'Qwen3 Coder',
    provider: 'Qwen',
    tier: 'free',
    contextWindow: 262_000,
    description: 'Best free coding-focused default for Archy workflows',
    pricing: { label: 'Free' },
    releaseDate: '2025-07-23',
    tags: ['free', 'coding', 'recommended'],
    recommended: true,
  },
] as ModelEntry[]).map(withCompareMetadata);

// ── Custom model persistence ────────────────────────────────────────

const STORAGE_KEY = 'archy_custom_models';

export function loadCustomModels(): ModelEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ModelEntry[];
    return parsed.map((m) => ({ ...m, tier: 'custom' as const }));
  } catch {
    return [];
  }
}

export function saveCustomModels(models: ModelEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function addCustomModel(entry: {
  name: string;
  endpoint: string;
  modelId: string;
  apiKey?: string;
}): ModelEntry {
  const existing = loadCustomModels();
  const newModel: ModelEntry = {
    id: 'custom/' + entry.modelId,
    name: entry.name,
    displayName: entry.name,
    provider: 'Custom',
    tier: 'custom',
    contextWindow: 0, // unknown
    description: entry.endpoint,
    pricing: { label: 'Custom endpoint' },
    releaseDate: '1970-01-01',
    tags: ['custom'],
    endpoint: entry.endpoint,
    modelId: entry.modelId,
    apiKey: entry.apiKey,
  };
  const updated = [...existing, newModel];
  saveCustomModels(updated);
  return newModel;
}

export function removeCustomModel(id: string): void {
  const existing = loadCustomModels();
  saveCustomModels(existing.filter((m) => m.id !== id));
}

// ── Merged registry ─────────────────────────────────────────────────

export function getAllModels(): ModelEntry[] {
  return [...BUILT_IN_MODELS, ...loadCustomModels()];
}

export function getModelById(id: string): ModelEntry | undefined {
  return getAllModels().find((m) => m.id === id);
}

export function getModelCompareMetadata(): Array<{
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
  context: number;
  pricing: string;
  releaseDate: string;
  tags: string[];
  recommended: boolean;
}> {
  return BUILT_IN_MODELS.map((m) => ({
    id: m.id,
    name: m.name || m.displayName,
    provider: m.provider,
    tier: m.tier,
    context: m.contextWindow,
    pricing: m.compareMetadata?.pricingLabel || m.pricing?.label || (m.tier === 'free' ? 'Free' : 'Paid'),
    releaseDate: m.compareMetadata?.releaseDate || m.releaseDate || '1970-01-01',
    tags: m.compareMetadata?.tags || m.tags || [],
    recommended: Boolean(m.compareMetadata?.recommended ?? m.recommended),
  }));
}

export function getBestFreeModelId(): string {
  const preferred = BUILT_IN_MODELS.find((m) => m.id === DEFAULT_FREE_MODEL_ID && m.tier === 'free');
  if (preferred) return preferred.id;
  return BUILT_IN_MODELS.find((m) => m.tier === 'free')?.id || '';
}

/** Check if a model endpoint looks like Ollama */
export function isOllamaEndpoint(endpoint?: string): boolean {
  if (!endpoint) return false;
  return endpoint.includes('localhost:11434') || endpoint.includes('127.0.0.1:11434');
}
