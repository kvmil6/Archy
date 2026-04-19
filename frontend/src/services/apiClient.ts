/**
 * Centralized API client for the Archy backend.
 *
 * - Pulls BACKEND_URL from Vite env (VITE_BACKEND_URL) or defaults to localhost:8000
 * - Typed wrappers for GET/POST with automatic JSON handling
 * - Retries on transient failures (network errors, 5xx)
 * - Normalizes errors into an ArchyApiError with detail + status
 */

export const BACKEND_URL: string =
    (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';

export class ArchyApiError extends Error {
    status: number;
    detail: string;
    endpoint: string;

    constructor(endpoint: string, status: number, detail: string) {
        super(`${endpoint}: ${detail}`);
        this.name = 'ArchyApiError';
        this.endpoint = endpoint;
        this.status = status;
        this.detail = detail;
    }
}

async function readError(res: Response, endpoint: string): Promise<ArchyApiError> {
    let detail = `HTTP ${res.status}`;
    try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
        else if (body?.message) detail = String(body.message);
        else if (typeof body === 'string') detail = body;
    } catch {
        try {
            const text = await res.text();
            if (text) detail = text.slice(0, 200);
        } catch {
            /* ignore */
        }
    }
    return new ArchyApiError(endpoint, res.status, detail);
}

async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: unknown,
    opts?: { signal?: AbortSignal; retries?: number },
): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
    const retries = opts?.retries ?? 2;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: opts?.signal,
            });

            if (res.status >= 500 && attempt < retries) {
                // Transient server error — retry with exponential backoff
                await new Promise((r) => setTimeout(r, 200 * (attempt + 1) ** 2));
                continue;
            }

            if (!res.ok) {
                throw await readError(res, endpoint);
            }

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return (await res.json()) as T;
            }
            return (await res.text()) as unknown as T;
        } catch (err) {
            lastError = err as Error;
            // Network-level failure — retry
            if (err instanceof ArchyApiError) throw err;
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, 200 * (attempt + 1) ** 2));
                continue;
            }
        }
    }
    // All retries exhausted
    throw new ArchyApiError(
        endpoint,
        0,
        `Network error: ${lastError?.message || 'unknown'}. Is the backend running on ${BACKEND_URL}?`,
    );
}

export const api = {
    get: <T,>(endpoint: string, opts?: { signal?: AbortSignal }): Promise<T> =>
        request<T>('GET', endpoint, undefined, opts),
    post: <T,>(endpoint: string, body?: unknown, opts?: { signal?: AbortSignal; retries?: number }): Promise<T> =>
        request<T>('POST', endpoint, body, opts),
    del: <T,>(endpoint: string, opts?: { signal?: AbortSignal }): Promise<T> =>
        request<T>('DELETE', endpoint, undefined, opts),
};

/**
 * Check if the backend is reachable. Returns the server version on success.
 */
export async function pingBackend(timeoutMs = 3000): Promise<{ online: boolean; version?: string; error?: string }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const data = await api.get<{ service: string; version: string }>('/', { signal: ctrl.signal });
        clearTimeout(t);
        return { online: true, version: data.version };
    } catch (err) {
        clearTimeout(t);
        return {
            online: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}
