import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'elevated' | 'glass';
    glow?: 'purple' | 'blue' | 'green' | 'none';
}

export const Card: React.FC<CardProps> = ({
    children, className = '', variant = 'default', glow = 'none', ...props
}) => {
    const variants = {
        default: 'bg-slate-800/80 border border-white/10',
        elevated: 'bg-slate-800/90 border border-white/10 shadow-lg',
        glass: 'bg-white/5 backdrop-blur-xl border border-white/10',
    };

    const glows = {
        none: '',
        purple: 'hover:shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-shadow duration-300',
        blue: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow duration-300',
        green: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-shadow duration-300',
    };

    return (
        <div
            className={`rounded-2xl p-5 ${variants[variant]} ${glows[glow]} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};