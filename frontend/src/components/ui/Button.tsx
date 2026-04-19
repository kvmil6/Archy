import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    children, className = '', variant = 'primary', size = 'md', loading = false, icon, disabled, ...props
}) => {
    const variants = {
        primary: 'bg-gradient-primary hover:opacity-90 text-white shadow-glow',
        secondary: 'bg-white/10 hover:bg-white/20 text-white border border-white/20',
        ghost: 'bg-transparent hover:bg-white/5 text-purple-500 border border-purple-500/30',
        danger: 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-5 py-2.5 text-base',
        lg: 'px-7 py-3.5 text-lg',
    };

    return (
        <button
            className={`
        inline-flex items-center justify-center gap-2 font-medium rounded-xl
        transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-purple-500/50
        ${variants[variant]} ${sizes[size]} ${className}
      `}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            )}
            {icon && !loading && <span className="text-lg">{icon}</span>}
            {children}
        </button>
    );
};