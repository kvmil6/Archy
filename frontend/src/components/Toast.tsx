import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    kind: ToastKind;
    title: string;
    message?: string;
    durationMs?: number;
    action?: { label: string; onClick: () => void };
}

type ToastContextValue = {
    toast: (t: Omit<Toast, 'id'>) => string;
    success: (title: string, message?: string) => string;
    error: (title: string, message?: string) => string;
    warning: (title: string, message?: string) => string;
    info: (title: string, message?: string) => string;
    dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Fallback no-op so components don't crash if provider is missing
        return {
            toast: () => '',
            success: () => '',
            error: () => '',
            warning: () => '',
            info: () => '',
            dismiss: () => {},
        };
    }
    return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const show = useCallback((t: Omit<Toast, 'id'>): string => {
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setToasts((prev) => [...prev, { id, ...t }]);
        const duration = t.durationMs ?? (t.kind === 'error' ? 6000 : 3500);
        if (duration > 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((x) => x.id !== id));
            }, duration);
        }
        return id;
    }, []);

    const value: ToastContextValue = {
        toast: show,
        success: (title, message) => show({ kind: 'success', title, message }),
        error: (title, message) => show({ kind: 'error', title, message }),
        warning: (title, message) => show({ kind: 'warning', title, message }),
        info: (title, message) => show({ kind: 'info', title, message }),
        dismiss,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
};

const ToastViewport: React.FC<{
    toasts: Toast[];
    onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;
    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[380px]">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
            ))}
        </div>
    );
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const config = KIND_CONFIG[toast.kind];
    const Icon = config.icon;
    return (
        <div
            className="pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border shadow-lg transition-all"
            style={{
                background: 'var(--color-surface)',
                borderColor: config.borderColor,
                borderLeftWidth: 3,
                borderLeftColor: config.accent,
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateX(0)' : 'translateX(20px)',
                transitionDuration: '200ms',
                transitionProperty: 'opacity, transform',
                backdropFilter: 'blur(12px)',
            }}
        >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: config.accent }} />
            <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
                    {toast.title}
                </div>
                {toast.message && (
                    <div
                        className="text-[11px] mt-0.5 break-words"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        {toast.message}
                    </div>
                )}
                {toast.action && (
                    <button
                        onClick={() => {
                            toast.action!.onClick();
                            onDismiss();
                        }}
                        className="mt-1.5 text-[11px] font-medium underline hover:no-underline"
                        style={{ color: config.accent }}
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={onDismiss}
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
            >
                <X className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
            </button>
        </div>
    );
};

const KIND_CONFIG: Record<
    ToastKind,
    {
        icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
        accent: string;
        borderColor: string;
    }
> = {
    success: {
        icon: CheckCircle2,
        accent: '#10b981',
        borderColor: 'rgba(16,185,129,0.25)',
    },
    error: {
        icon: XCircle,
        accent: '#ef4444',
        borderColor: 'rgba(239,68,68,0.25)',
    },
    warning: {
        icon: AlertTriangle,
        accent: '#f59e0b',
        borderColor: 'rgba(245,158,11,0.25)',
    },
    info: {
        icon: Info,
        accent: '#3b82f6',
        borderColor: 'rgba(59,130,246,0.25)',
    },
};
