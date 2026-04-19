import React from 'react';
import { colors } from '@/styles/design';

interface NodeBadgeProps {
    type: 'route' | 'service' | 'model' | 'schema' | 'provider' | 'utility';
    label: string;
    subtitle?: string;
    selected?: boolean;
    onClick?: () => void;
}

const nodeConfig = {
    route: { color: colors.nodes.route, icon: '🛣️', label: 'Route' },
    service: { color: colors.nodes.service, icon: '⚙️', label: 'Service' },
    model: { color: colors.nodes.model, icon: '🗄️', label: 'Model' },
    schema: { color: colors.nodes.schema, icon: '📋', label: 'Schema' },
    provider: { color: colors.nodes.provider, icon: '🔌', label: 'Provider' },
    utility: { color: colors.nodes.utility, icon: '🔧', label: 'Utility' },
};

export const NodeBadge: React.FC<NodeBadgeProps> = ({ type, label, subtitle, selected, onClick }) => {
    const config = nodeConfig[type];

    return (
        <div
            onClick={onClick}
            className={`
        relative w-56 p-4 rounded-xl border-2 cursor-grab active:cursor-grabbing
        transition-all duration-200 select-none
        ${selected ? 'ring-2 ring-white/50 scale-105' : 'hover:scale-[1.02]'}
      `}
            style={{
                background: `${config.color}20`,
                borderColor: selected ? config.color : `${config.color}60`,
                boxShadow: selected ? `0 0 20px ${config.color}40` : 'none',
            }}
        >
            {/* Connection handles */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gray-400 border-2 border-slate-900" />
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gray-400 border-2 border-slate-900" />

            {/* Content */}
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{config.icon}</span>
                <span className="font-semibold text-white text-sm">{config.label}</span>
            </div>
            <div className="font-mono text-white/90 text-sm truncate">{label}</div>
            {subtitle && <div className="text-xs text-white/60 mt-1">{subtitle}</div>}

            {/* Hover glow */}
            <div
                className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
                style={{
                    background: `radial-gradient(ellipse at center, ${config.color}20 0%, transparent 70%)`
                }}
            />
        </div>
    );
};