import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ArrowUp, ArrowDown, ArrowUpRight } from 'lucide-react';
import type { Node } from '@xyflow/react';
import { getNodeConfig } from './NodeTypes';

interface GraphSearchProps {
    isOpen: boolean;
    nodes: Node[];
    onClose: () => void;
    /** Called when user picks a node — should pan/zoom to it. */
    onSelect: (nodeId: string) => void;
    /** Optional: called when user Alt-Enters to trace from this node. */
    onTrace?: (nodeId: string) => void;
}

/**
 * Find any node in the graph by name, type, or file path.
 * Keyboard-first: Arrow keys navigate, Enter selects, Alt+Enter traces, Esc closes.
 */
export const GraphSearch: React.FC<GraphSearchProps> = ({
    isOpen,
    nodes,
    onClose,
    onSelect,
    onTrace,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIdx(0);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [isOpen]);

    // Filter + rank results
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            // With no query, show first 30 nodes
            return nodes.slice(0, 30).map((n) => ({ node: n, score: 0, matchIn: 'name' as const }));
        }

        type Ranked = { node: Node; score: number; matchIn: 'name' | 'type' | 'path' };
        const ranked: Ranked[] = [];
        for (const n of nodes) {
            const data = n.data as any;
            const label = String(data?.label ?? n.id).toLowerCase();
            const type = String(n.type ?? '').toLowerCase();
            const filepath = String(data?.filepath ?? '').toLowerCase();

            let score = 0;
            let matchIn: 'name' | 'type' | 'path' = 'name';

            if (label === q) score = 1000;
            else if (label.startsWith(q)) score = 500;
            else if (label.includes(q)) score = 200;
            else if (type.includes(q)) {
                score = 80;
                matchIn = 'type';
            } else if (filepath.includes(q)) {
                score = 40;
                matchIn = 'path';
            }

            if (score > 0) ranked.push({ node: n, score, matchIn });
        }

        return ranked.sort((a, b) => b.score - a.score).slice(0, 50);
    }, [nodes, query]);

    // Keep selection in bounds
    useEffect(() => {
        if (selectedIdx >= results.length) {
            setSelectedIdx(Math.max(0, results.length - 1));
        }
    }, [results.length, selectedIdx]);

    // Scroll selected into view
    useEffect(() => {
        const node = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
        node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIdx]);

    // Keyboard handlers
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const pick = results[selectedIdx];
                if (!pick) return;
                if (e.altKey && onTrace) {
                    onTrace(pick.node.id);
                } else {
                    onSelect(pick.node.id);
                }
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, results, selectedIdx, onSelect, onTrace, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-24"
            style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
        >
            <div
                className="surface-elevated w-full max-w-[540px] mx-4 overflow-hidden flex flex-col"
                style={{ borderRadius: 12, maxHeight: 'calc(100vh - 12rem)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="relative shrink-0 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--color-text-muted)' }}
                    />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIdx(0);
                        }}
                        placeholder="Find a node by name, type, or path..."
                        className="w-full pl-11 pr-20 py-3.5 bg-transparent outline-none text-[14px]"
                        style={{ color: 'var(--color-text)' }}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <span className="kbd">esc</span>
                    </div>
                </div>

                {/* Results */}
                <div
                    ref={listRef}
                    className="flex-1 overflow-y-auto custom-scrollbar py-1"
                    style={{ minHeight: 0 }}
                >
                    {results.length === 0 ? (
                        <div
                            className="py-10 text-center text-[13px]"
                            style={{ color: 'var(--color-text-muted)' }}
                        >
                            {query ? `No nodes matching "${query}"` : 'No nodes in graph'}
                        </div>
                    ) : (
                        results.map((r, idx) => {
                            const node = r.node;
                            const cfg = getNodeConfig(node.type || 'utility');
                            const Icon = cfg.icon;
                            const data = node.data as any;
                            const label = data?.label ?? node.id;
                            const filepath = data?.filepath;
                            const isSelected = idx === selectedIdx;
                            return (
                                <div
                                    key={node.id}
                                    data-idx={idx}
                                    onClick={() => {
                                        onSelect(node.id);
                                        onClose();
                                    }}
                                    onMouseEnter={() => setSelectedIdx(idx)}
                                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                                    style={{
                                        background: isSelected ? 'var(--color-surface-hover)' : 'transparent',
                                    }}
                                >
                                    <div
                                        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                                        style={{ background: cfg.bgColor, color: cfg.color }}
                                    >
                                        <Icon size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="text-[13px] font-medium truncate"
                                                style={{ color: 'var(--color-text)' }}
                                            >
                                                {label}
                                            </span>
                                            <span
                                                className="text-[9px] font-mono font-bold uppercase px-1 py-0.5 rounded flex-shrink-0"
                                                style={{
                                                    background: cfg.bgColor,
                                                    color: cfg.color,
                                                }}
                                            >
                                                {cfg.label}
                                            </span>
                                            {r.matchIn !== 'name' && (
                                                <span
                                                    className="text-[9px] font-mono opacity-60 flex-shrink-0"
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                >
                                                    via {r.matchIn}
                                                </span>
                                            )}
                                        </div>
                                        {filepath && (
                                            <div
                                                className="text-[11px] font-mono mt-0.5 truncate"
                                                style={{ color: 'var(--color-text-muted)' }}
                                            >
                                                {filepath}
                                            </div>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <ArrowUpRight
                                            className="w-3.5 h-3.5 flex-shrink-0"
                                            style={{ color: 'var(--color-accent)' }}
                                        />
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div
                    className="flex items-center justify-between px-4 py-2 text-[10px] font-mono border-t shrink-0"
                    style={{
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-muted)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <ArrowUp className="w-2.5 h-2.5" />
                            <ArrowDown className="w-2.5 h-2.5" />
                            <span>navigate</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="kbd">↵</span>
                            <span>focus</span>
                        </span>
                        {onTrace && (
                            <span className="flex items-center gap-1">
                                <span className="kbd">alt</span>+<span className="kbd">↵</span>
                                <span>trace</span>
                            </span>
                        )}
                    </div>
                    <span>
                        {results.length} {results.length === 1 ? 'match' : 'matches'}
                    </span>
                </div>
            </div>
        </div>
    );
};
