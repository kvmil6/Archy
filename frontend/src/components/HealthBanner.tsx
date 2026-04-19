import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL } from '../services/apiClient';
import { isTauri } from '../services/fileSystem';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function HealthBanner() {
    const [offline, setOffline] = useState(false);
    const [retrying, setRetrying] = useState(false);

    const check = useCallback(async () => {
        try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 2000);
            const res = await fetch(`${BACKEND_URL}/health`, { signal: ctrl.signal });
            clearTimeout(timeout);
            setOffline(!res.ok);
        } catch {
            setOffline(true);
        }
    }, []);

    useEffect(() => {
        if (isTauri()) return;
        check();
        const id = setInterval(check, 15_000);
        return () => clearInterval(id);
    }, [check]);

    const retry = async () => {
        setRetrying(true);
        await check();
        setRetrying(false);
    };

    if (!offline) return null;

    return (
        <div
            className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium"
            style={{ background: '#dc2626', color: '#fff' }}
        >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Backend not reachable — make sure it's running on {BACKEND_URL}
            <button
                onClick={retry}
                disabled={retrying}
                className="ml-2 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold transition hover:bg-white/20 disabled:opacity-50"
            >
                <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
                Retry
            </button>
        </div>
    );
}
