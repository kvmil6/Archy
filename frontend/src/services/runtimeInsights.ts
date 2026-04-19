import { BACKEND_URL } from './apiClient';

export interface RuntimeEventPayload {
  event_type: string;
  command: string;
  status: 'started' | 'success' | 'error';
  duration_ms?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeEventItem {
  event_type: string;
  command: string;
  status: string;
  duration_ms: number | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RuntimeSummary {
  total_events: number;
  success_events: number;
  failed_events: number;
  avg_duration_ms: number | null;
  by_type: Record<string, number>;
  top_commands: Array<[string, number]>;
  recent_events: RuntimeEventItem[];
}

export async function trackRuntimeEvent(payload: RuntimeEventPayload): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/runtime/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        source: payload.source || 'frontend',
        metadata: payload.metadata || {},
      }),
    });
  } catch {
    return;
  }
}

export async function fetchRuntimeSummary(): Promise<RuntimeSummary | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/runtime/summary`);
    if (!res.ok) return null;
    return (await res.json()) as RuntimeSummary;
  } catch {
    return null;
  }
}
