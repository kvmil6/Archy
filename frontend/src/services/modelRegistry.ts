/**
 * Typed model registry for Archy AI.
 *
 * Every model entry carries: id, displayName, provider, tier, contextWindow, description.
 * Custom models are persisted in localStorage under "archy_custom_models".
 */

export type ModelTier = 'paid' | 'free' | 'custom';

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: string;
  tier: ModelTier;
  contextWindow: number;
  description: string;
  /** Full URL override (e.g. http://localhost:11434/v1) — only for custom/Ollama models */
  endpoint?: string;
  /** Model string sent in the API request — only for custom models */
  modelId?: string;
  /** Optional API key override — only for custom models */
  apiKey?: string;
}

// ── Built-in models ─────────────────────────────────────────────────

export const BUILT_IN_MODELS: ModelEntry[] = [
  // Paid
  {
    id: 'anthropic/claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    tier: 'paid',
    contextWindow: 200_000,
    description: 'Balanced speed & intelligence for code tasks',
  },
  {
    id: 'openai/gpt-4o',
    displayName: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'paid',
    contextWindow: 128_000,
    description: 'Multimodal flagship with fast responses',
  },
  {
    id: 'meta-llama/llama-3.1-405b',
    displayName: 'Llama 3.1 405B',
    provider: 'Meta',
    tier: 'paid',
    contextWindow: 128_000,
    description: 'Largest open-weight model, strong reasoning',
  },
  // Free
  {
    id: 'moonshotai/kimi-k2.5',
    displayName: 'Kimi K2.5',
    provider: 'Moonshot',
    tier: 'free',
    contextWindow: 128_000,
    description: 'Fast free-tier model with solid code ability',
  },
  {
    id: 'qwen/qwen3-coder:free',
    displayName: 'Qwen3 Coder',
    provider: 'Qwen',
    tier: 'free',
    contextWindow: 128_000,
    description: 'Code-specialised free model from Alibaba',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    displayName: 'Gemma 4 31B',
    provider: 'Google',
    tier: 'free',
    contextWindow: 128_000,
    description: 'Google open model, good for general tasks',
  },
];

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
    id: `custom/${entry.modelId}`,
    displayName: entry.name,
    provider: 'Custom',
    tier: 'custom',
    contextWindow: 0, // unknown
    description: entry.endpoint,
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

/** Check if a model endpoint looks like Ollama */
export function isOllamaEndpoint(endpoint?: string): boolean {
  if (!endpoint) return false;
  return endpoint.includes('localhost:11434') || endpoint.includes('127.0.0.1:11434');
}
