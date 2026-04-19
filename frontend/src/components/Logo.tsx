import React from 'react';

/**
 * Archy Logo — hexagonal 3D "A" cube
 * Matches brand identity: navy hexagon with cyan inset "A" letterform
 */
export const Logo: React.FC<{ size?: number; className?: string; glow?: boolean }> = ({
  size = 32,
  className = '',
  glow = false,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 110"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        filter: glow ? 'drop-shadow(0 0 12px rgba(34, 211, 238, 0.4))' : undefined,
      }}
    >
      <defs>
        {/* Dark navy gradients for the three visible faces of the hexagon */}
        <linearGradient id="face-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="face-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="face-right" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        {/* Cyan A gradient */}
        <linearGradient id="a-letter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* Hexagonal cube — isometric view */}
      {/* Top face (lightest) */}
      <polygon points="50,5 90,25 50,45 10,25" fill="url(#face-top)" />
      {/* Left face */}
      <polygon points="10,25 50,45 50,95 10,75" fill="url(#face-left)" />
      {/* Right face */}
      <polygon points="90,25 50,45 50,95 90,75" fill="url(#face-right)" />

      {/* Cyan "A" letter inset in the front */}
      {/* The A is created from the left and right faces meeting */}
      <g>
        {/* Left diagonal of A (on left face) */}
        <polygon 
          points="28,72 38,44 50,44 50,55 44,55 40,72" 
          fill="url(#a-letter)" 
        />
        {/* Right diagonal of A (on right face) */}
        <polygon 
          points="72,72 62,44 50,44 50,55 56,55 60,72" 
          fill="url(#a-letter)" 
          opacity="0.85"
        />
        {/* Crossbar of A */}
        <polygon 
          points="43,62 57,62 58,66 42,66" 
          fill="url(#a-letter)" 
        />
        {/* Inner triangle (the A's counter) - dark, cut into letter */}
        <polygon 
          points="46,66 54,66 50,52" 
          fill="#0f172a" 
        />
      </g>

      {/* Subtle top edge highlight */}
      <line x1="10" y1="25" x2="50" y2="45" stroke="rgba(34, 211, 238, 0.15)" strokeWidth="0.5" />
      <line x1="90" y1="25" x2="50" y2="45" stroke="rgba(34, 211, 238, 0.15)" strokeWidth="0.5" />
    </svg>
  );
};

/**
 * Animated version with subtle pulse/glow for hero usage
 */
export const LogoAnimated: React.FC<{ size?: number; className?: string }> = ({
  size = 48,
  className = '',
}) => {
  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <Logo size={size} glow />
      <style>{`
        @keyframes logo-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.3)); }
          50% { filter: drop-shadow(0 0 16px rgba(34, 211, 238, 0.6)); }
        }
      `}</style>
    </div>
  );
};
