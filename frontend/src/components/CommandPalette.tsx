import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  FileCode,
  Database,
  Network,
  Settings,
  Brain,
  Download,
  Home,
  RefreshCw,
  Layers,
  Zap,
  GitBranch,
  AlertTriangle,
} from 'lucide-react';

export type Command = {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  section: string;
  keywords?: string[];
  shortcut?: string[];
  action: () => void;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().replace(/^[/>]\s*/, '');
    if (!q) return commands;
    return commands.filter((c) => {
      return (
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        c.keywords?.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [commands, query]);

  const grouped = useMemo(() => {
    const map: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      if (!map[cmd.section]) map[cmd.section] = [];
      map[cmd.section].push(cmd);
    }
    return map;
  }, [filtered]);

  const flatItems = useMemo(() => Object.values(grouped).flat(), [grouped]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          flatItems[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, flatItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  let itemIndex = 0;

  return (
    <div className="cmd-k-root" onClick={onClose}>
      <div className="cmd-k-panel" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="cmd-k-input pl-12"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="kbd">esc</span>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto custom-scrollbar py-2">
          {Object.keys(grouped).length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
              No matching commands
            </div>
          ) : (
            Object.entries(grouped).map(([section, cmds]) => (
              <div key={section}>
                <div className="px-5 py-1.5 mono-label" style={{ fontSize: 9 }}>
                  {section}
                </div>
                {cmds.map((cmd) => {
                  const currentIndex = itemIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      className={`cmd-k-item ${isSelected ? 'selected' : ''}`}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                    >
                      <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--color-surface-hover)' }}>
                        {cmd.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                          {cmd.label}
                        </div>
                        {cmd.description && (
                          <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <div className="flex items-center gap-1">
                          {cmd.shortcut.map((k, i) => (
                            <span key={i} className="kbd">
                              {k}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-2.5 border-t text-[11px] flex items-center justify-between font-mono" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">↵</span>
              <span>select</span>
            </span>
          </div>
          <span>{flatItems.length} commands</span>
        </div>
      </div>
    </div>
  );
};

export const commandIcons = {
  file: <FileCode className="w-3.5 h-3.5" />,
  database: <Database className="w-3.5 h-3.5" />,
  network: <Network className="w-3.5 h-3.5" />,
  settings: <Settings className="w-3.5 h-3.5" />,
  brain: <Brain className="w-3.5 h-3.5" />,
  download: <Download className="w-3.5 h-3.5" />,
  home: <Home className="w-3.5 h-3.5" />,
  refresh: <RefreshCw className="w-3.5 h-3.5" />,
  layers: <Layers className="w-3.5 h-3.5" />,
  zap: <Zap className="w-3.5 h-3.5" />,
  git: <GitBranch className="w-3.5 h-3.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5" />,
};
