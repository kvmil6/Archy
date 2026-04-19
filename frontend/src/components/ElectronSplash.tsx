import { useEffect, useState } from 'react';

type BackendState = 'starting' | 'ready' | 'error';

interface StatusPayload {
    state: BackendState;
    message: string;
}

interface Props {
    onReady: () => void;
}

export default function ElectronSplash({ onReady }: Props) {
    const [status, setStatus] = useState<StatusPayload>({
        state: 'starting',
        message: 'Starting backend…',
    });

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onBackendStatus) {
            onReady();
            return;
        }

        api.isBackendReady?.().then((ready: boolean) => {
            if (ready) { onReady(); return; }
        });

        const unsubscribe = api.onBackendStatus((payload: StatusPayload) => {
            setStatus(payload);
            if (payload.state === 'ready') {
                setTimeout(onReady, 200);
            }
        });

        return () => unsubscribe?.();
    }, [onReady]);

    if (status.state === 'ready') return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#0a0a0f',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '1.5rem',
        }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect width="64" height="64" rx="14" fill="#6366f1" />
                <path d="M16 20h32M16 32h20M16 44h28" stroke="white" strokeWidth="4" strokeLinecap="round" />
            </svg>

            <p style={{ color: '#a5b4fc', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                Archy
            </p>

            {status.state === 'starting' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: 200, height: 3, background: '#1e1e2e', borderRadius: 99, overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%', background: '#6366f1', borderRadius: 99,
                            animation: 'splash-progress 1.8s ease-in-out infinite',
                        }} />
                    </div>
                    <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
                        {status.message}
                    </p>
                </div>
            )}

            {status.state === 'error' && (
                <div style={{
                    background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: 8,
                    padding: '1rem 1.5rem', maxWidth: 400, textAlign: 'center',
                }}>
                    <p style={{ color: '#fca5a5', margin: '0 0 0.5rem', fontWeight: 600 }}>
                        Backend failed to start
                    </p>
                    <p style={{ color: '#9ca3af', fontSize: '0.8125rem', margin: 0 }}>
                        {status.message}
                    </p>
                    <button
                        onClick={() => (window as any).location.reload()}
                        style={{
                            marginTop: '1rem', padding: '0.5rem 1.25rem',
                            background: '#6366f1', color: 'white', border: 'none',
                            borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem',
                        }}
                    >
                        Retry
                    </button>
                </div>
            )}

            <style>{`
                @keyframes splash-progress {
                    0%   { width: 0%; margin-left: 0; }
                    50%  { width: 70%; margin-left: 0; }
                    100% { width: 0%; margin-left: 100%; }
                }
            `}</style>
        </div>
    );
}
