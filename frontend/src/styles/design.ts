// frontend/src/styles/design.ts

export const colors = {
    // Brand gradient
    primary: {
        from: '#9333ea', // purple-600
        to: '#ec4899',   // pink-500
    },
    // Node colors (per spec)
    nodes: {
        route: '#9333ea',    // purple - API Endpoint
        service: '#3b82f6',  // blue - Business Logic
        model: '#22c55e',    // green - Database Model
        schema: '#f59e0b',   // orange - Schema/DTO
        provider: '#ef4444', // red - External Provider
        utility: '#6b7280',  // gray - Utility/Helper
    },
    // UI surfaces
    bg: {
        primary: '#0f172a',  // slate-900
        secondary: '#1e293b',// slate-800
        card: 'rgba(30, 41, 59, 0.7)', // slate-800/70
    },
    // Text
    text: {
        primary: '#f8fafc',  // slate-50
        secondary: '#94a3b8',// slate-400
        muted: '#64748b',    // slate-500
    },
    // Borders
    border: {
        light: 'rgba(148, 163, 184, 0.2)',
        hover: 'rgba(148, 163, 184, 0.4)',
        focus: '#9333ea',
    },
    // Status
    status: {
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
    },
};

export const shadows = {
    soft: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    card: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    elevated: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    glow: '0 0 20px rgba(147, 51, 234, 0.3)',
};

export const radii = {
    sm: '0.375rem',   // 6px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    full: '9999px',
};

export const transitions = {
    fast: '150ms ease-in-out',
    normal: '200ms ease-in-out',
    slow: '300ms ease-in-out',
};

export const typography = {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, ui-monospace, monospace',
    sizes: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
    },
    weights: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
    },
};