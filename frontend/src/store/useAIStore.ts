/**
 * Zustand store for AI state — selected model, token usage, API key status.
 *
 * Persists across panel open/close within a session.
 * Resets on Clear chat or new project selection.
 */
import { create } from 'zustand';
import type { ModelEntry } from '@/services/modelRegistry';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

interface AIState {
  /** Currently selected model id (empty string = AI disabled) */
  selectedModelId: string;
  /** Per-model token usage this session: modelId → usage */
  tokenUsage: Record<string, TokenUsage>;
  /** Total models used this session */
  modelsUsedCount: number;
  /** Whether the OpenRouter API key is configured */
  hasApiKey: boolean;

  // Actions
  setSelectedModel: (id: string) => void;
  setHasApiKey: (has: boolean) => void;
  addTokenUsage: (modelId: string, input: number, output: number) => void;
  getModelUsage: (modelId: string) => TokenUsage;
  getSessionTotal: () => { tokens: number; models: number };
  resetUsage: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  selectedModelId: '',
  tokenUsage: {},
  modelsUsedCount: 0,
  hasApiKey: false,

  setSelectedModel: (id) => set({ selectedModelId: id }),

  setHasApiKey: (has) => set({ hasApiKey: has }),

  addTokenUsage: (modelId, input, output) =>
    set((state) => {
      const prev = state.tokenUsage[modelId] || { inputTokens: 0, outputTokens: 0 };
      const updated = {
        ...state.tokenUsage,
        [modelId]: {
          inputTokens: prev.inputTokens + input,
          outputTokens: prev.outputTokens + output,
        },
      };
      return {
        tokenUsage: updated,
        modelsUsedCount: Object.keys(updated).length,
      };
    }),

  getModelUsage: (modelId) => {
    return get().tokenUsage[modelId] || { inputTokens: 0, outputTokens: 0 };
  },

  getSessionTotal: () => {
    const { tokenUsage } = get();
    const entries = Object.values(tokenUsage);
    const tokens = entries.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
    return { tokens, models: entries.length };
  },

  resetUsage: () => set({ tokenUsage: {}, modelsUsedCount: 0 }),
}));
