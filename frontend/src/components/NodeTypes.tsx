import React, { memo, useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import {
  Network,
  Database,
  GitBranch,
  Box,
  DatabaseBackup,
  Boxes,
  Layers2,
  Rocket,
  Puzzle,
  Workflow,
  BookTemplate,
  Settings,
  FileCode,
  Zap,
  StickyNote,
} from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';

type NodeTypeConfig = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  color: string;
  bgColor: string;
  glowColor: string;
};

const NODE_CONFIGS: Record<string, NodeTypeConfig> = {
  app:            { icon: Rocket,         label: 'Entry',          color: '#f472b6', bgColor: 'rgba(244,114,182,0.14)',  glowColor: 'rgba(244,114,182,0.25)' },
  module:         { icon: Puzzle,         label: 'Module',         color: '#2dd4bf', bgColor: 'rgba(45,212,191,0.14)',  glowColor: 'rgba(45,212,191,0.25)' },
  entryInterface: { icon: Workflow,       label: 'Entry interface', color: '#60a5fa', bgColor: 'rgba(96,165,250,0.14)',  glowColor: 'rgba(96,165,250,0.25)' },
  controller:     { icon: GitBranch,      label: 'Controller',     color: '#818cf8', bgColor: 'rgba(129,140,248,0.14)', glowColor: 'rgba(129,140,248,0.25)' },
  diContainer:    { icon: Boxes,          label: 'DI container',   color: '#22d3ee', bgColor: 'rgba(34,211,238,0.14)',   glowColor: 'rgba(34,211,238,0.25)' },
  repoInterface:  { icon: Layers2,        label: 'Repo interface', color: '#94a3b8', bgColor: 'rgba(148,163,184,0.14)', glowColor: 'rgba(148,163,184,0.22)' },
  domain:         { icon: Box,            label: 'Domain',         color: '#fb7185', bgColor: 'rgba(251,113,133,0.14)',   glowColor: 'rgba(251,113,133,0.25)' },
  repository:     { icon: DatabaseBackup, label: 'Repository',     color: '#fb923c', bgColor: 'rgba(251,146,60,0.14)',  glowColor: 'rgba(251,146,60,0.25)' },
  route:          { icon: Network,        label: 'Route',          color: '#c4b5fd', bgColor: 'rgba(196,181,253,0.14)', glowColor: 'rgba(196,181,253,0.25)' },
  service:        { icon: Settings,       label: 'Service',        color: '#38bdf8', bgColor: 'rgba(56,189,248,0.14)',  glowColor: 'rgba(56,189,248,0.25)' },
  model:          { icon: Database,       label: 'Model',          color: '#4ade80', bgColor: 'rgba(74,222,128,0.14)',  glowColor: 'rgba(74,222,128,0.25)' },
  schema:         { icon: BookTemplate,   label: 'Schema',         color: '#fbbf24', bgColor: 'rgba(251,191,36,0.14)',  glowColor: 'rgba(251,191,36,0.25)' },
  utility:        { icon: FileCode,       label: 'Module',         color: '#94a3b8', bgColor: 'rgba(148,163,184,0.12)', glowColor: 'rgba(148,163,184,0.2)' },
  canvasCard:     { icon: StickyNote,     label: 'Note',           color: '#c4b5fd', bgColor: 'rgba(196,181,253,0.12)', glowColor: 'rgba(196,181,253,0.28)' },
};

const UniversalNode = memo(({ data, selected, type }: NodeProps<Node> & { type: string }) => {
  const d = data as any;
  const config = NODE_CONFIGS[type] || NODE_CONFIGS.utility;
  const Icon = config.icon;

  const label = d.label || 'Unnamed';
  const description = d.description || d.purpose;
  const filepath = d.filepath;
  const complexity: number | undefined = d.complexity;
  const methodCount: number = d.methodCount || (d.methods ? d.methods.length : 0);
  const method: string | undefined = d.method;
  const isAsync: boolean = !!d.isAsync;
  const importance: number = d.importance ?? 0;
  const isHotspot = typeof complexity === 'number' && complexity > 7;

  const complexityColor =
    complexity === undefined ? '#4ade80' :
    complexity > 7 ? '#f87171' :
    complexity > 4 ? '#fbbf24' :
    '#4ade80';

  const importanceGlow = importance > 0.6
    ? `0 0 0 1px ${config.color}35, 0 0 ${Math.round(importance * 18)}px ${config.glowColor}`
    : undefined;

  const shellShadow = selected
    ? `0 0 0 1px ${config.color}, 0 12px 40px rgba(0,0,0,0.55), 0 0 32px ${config.glowColor}`
    : importanceGlow ?? '0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)';

  const handleRing = {
    width: 11,
    height: 11,
    border: '2px solid #0a0a0f',
    background: config.color,
    boxShadow: `0 0 0 1px ${config.color}66`,
  } as const;

  return (
    <div className="archy-node group relative w-[280px] max-w-[min(280px,92vw)]">
      <span
        className="pointer-events-none absolute left-0 top-1/2 z-0 -translate-x-[calc(100%+6px)] -translate-y-1/2 text-[8px] font-mono font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'rgba(161,161,170,0.85)' }}
        aria-hidden
      >
        In
      </span>
      <span
        className="pointer-events-none absolute right-0 top-1/2 z-0 translate-x-[calc(100%+6px)] -translate-y-1/2 text-[8px] font-mono font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'rgba(161,161,170,0.85)' }}
        aria-hidden
      >
        Out
      </span>

      <Handle type="target" position={Position.Left} id="in" className="!opacity-100" style={{ ...handleRing, left: -6 }} />

      <div
        className="relative overflow-hidden rounded-[11px] transition-all duration-200"
        style={{
          background: 'linear-gradient(165deg, rgba(26,26,32,0.98) 0%, rgba(12,12,16,0.99) 100%)',
          border: `1px solid ${selected ? `${config.color}99` : 'rgba(255,255,255,0.08)'}`,
          boxShadow: shellShadow,
        }}
      >
        <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${config.color}, ${config.color}88)` }} />

        <div
          className={`flex items-start justify-between gap-2 px-3.5 pt-3 ${description ? 'pb-2' : 'pb-3'}`}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{
                background: config.bgColor,
                color: config.color,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
              }}
            >
              <Icon size={18} className="shrink-0" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em]"
                style={{ color: config.color }}
              >
                {config.label}
              </div>
              <div className="mt-1.5 text-[15px] font-semibold leading-tight tracking-tight text-zinc-100">
                {label}
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            {isHotspot && (
              <span className="hotspot-dot" title={`High complexity: ${complexity}`} style={{ background: '#f87171' }} />
            )}
            {method && (
              <span
                className="rounded px-1.5 py-0.5 text-[8px] font-mono font-bold"
                style={{ background: 'rgba(255,255,255,0.06)', color: config.color }}
              >
                {method}
              </span>
            )}
            {isAsync && (
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[8px] font-mono font-bold text-cyan-400">
                ASYNC
              </span>
            )}
          </div>
        </div>

        {description && (
          <div className="px-3.5 pb-3">
            <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-500">{description}</p>
          </div>
        )}

        {(methodCount > 0 || (complexity !== undefined && complexity > 0) || filepath) && (
          <div className="border-t border-white/[0.06] px-3.5 py-2">
            <div className="mb-1.5 flex items-center gap-3">
              {methodCount > 0 && (
                <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
                  <span className="text-zinc-600">FN</span>
                  <span className="numeric text-zinc-400">{methodCount}</span>
                </div>
              )}
              {complexity !== undefined && complexity > 0 && (
                <div className="flex items-center gap-1 text-[9px] font-mono">
                  <Zap size={9} style={{ color: complexityColor }} />
                  <span className="numeric" style={{ color: complexityColor }}>
                    {complexity}
                  </span>
                </div>
              )}
              {filepath && (
                <div
                  className="ml-auto max-w-[55%] truncate text-[9px] font-mono text-zinc-600"
                  title={filepath}
                >
                  {filepath.split('/').slice(-2).join('/')}
                </div>
              )}
            </div>
            {complexity !== undefined && complexity > 0 && (
              <div className="h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="complexity-bar h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (complexity / 12) * 100)}%`,
                    background: complexityColor,
                    opacity: 0.85,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="!opacity-100" style={{ ...handleRing, right: -6 }} />
    </div>
  );
});

UniversalNode.displayName = 'UniversalNode';

export const AppNode            = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="app" />);
export const ModuleNode         = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="module" />);
export const EntryInterfaceNode = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="entryInterface" />);
export const ControllerNode     = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="controller" />);
export const DIContainerNode    = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="diContainer" />);
export const RepoInterfaceNode  = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="repoInterface" />);
export const DomainNode         = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="domain" />);
export const RepositoryNode     = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="repository" />);
export const RouteNode          = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="route" />);
export const ServiceNode        = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="service" />);
export const ModelNode          = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="model" />);
export const SchemaNode         = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="schema" />);
export const UtilityNode        = memo((props: NodeProps<Node>) => <UniversalNode {...props} type="utility" />);

AppNode.displayName            = 'AppNode';
ModuleNode.displayName         = 'ModuleNode';
EntryInterfaceNode.displayName = 'EntryInterfaceNode';
ControllerNode.displayName     = 'ControllerNode';
DIContainerNode.displayName    = 'DIContainerNode';
RepoInterfaceNode.displayName  = 'RepoInterfaceNode';
DomainNode.displayName         = 'DomainNode';
RepositoryNode.displayName     = 'RepositoryNode';
RouteNode.displayName          = 'RouteNode';
ServiceNode.displayName        = 'ServiceNode';
ModelNode.displayName          = 'ModelNode';
SchemaNode.displayName         = 'SchemaNode';
UtilityNode.displayName        = 'UtilityNode';

/** Obsidian Canvas–style freeform card: title + markdown-friendly body, four-way handles. */
const CanvasCardNode = memo(({ id, data, selected }: NodeProps<Node>) => {
  const d = data as {
    label?: string;
    body?: string;
    variant?: 'default' | 'pros' | 'cons';
  };
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const config = NODE_CONFIGS.canvasCard;
  const [editing, setEditing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyAreaRef = useRef<HTMLTextAreaElement>(null);
  const title = d.label || 'Note';
  const body = d.body ?? 'Double-click to edit.\n\n- Bullet points\n- **Bold** with asterisks';
  const variant = d.variant ?? 'default';

  const accent =
    variant === 'pros' ? 'rgba(74, 222, 128, 0.65)' :
    variant === 'cons' ? 'rgba(248, 113, 113, 0.65)' :
    config.color;

  const renderBody = () => {
    const lines = body.split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        return (
          <div key={i} className="flex gap-1.5 text-[11px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            <span style={{ color: accent }}>•</span>
            <span>{trimmed.replace(/^[-*]\s+/, '')}</span>
          </div>
        );
      }
      if (trimmed === '') return <div key={i} className="h-1.5" />;
      const bolded = trimmed.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        if (m) return <strong key={j} className="font-semibold text-[var(--color-text)]">{m[1]}</strong>;
        return <span key={j}>{part}</span>;
      });
      return (
        <p key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {bolded}
        </p>
      );
    });
  };

  return (
    <div
      data-canvas-card
      className="archy-node relative w-[280px] max-w-[min(280px,85vw)]"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <span
        className="pointer-events-none absolute left-0 top-1/2 z-0 -translate-x-[calc(100%+6px)] -translate-y-1/2 text-[8px] font-mono font-semibold uppercase tracking-[0.14em] text-zinc-500"
        aria-hidden
      >
        In
      </span>
      <span
        className="pointer-events-none absolute right-0 top-1/2 z-0 translate-x-[calc(100%+6px)] -translate-y-1/2 text-[8px] font-mono font-semibold uppercase tracking-[0.14em] text-zinc-500"
        aria-hidden
      >
        Out
      </span>
      <Handle type="target" position={Position.Left} id="in" className="!opacity-100" style={{ ...handleStyle, left: -6 }} />
      <Handle type="source" position={Position.Right} id="out" className="!opacity-100" style={{ ...handleStyle, right: -6 }} />

      <div
        className="overflow-hidden rounded-xl transition-all duration-200"
        style={{
          background: 'linear-gradient(165deg, rgba(26,26,32,0.98) 0%, rgba(12,12,16,0.99) 100%)',
          border: `1px solid ${selected ? `${accent}99` : 'rgba(255,255,255,0.08)'}`,
          boxShadow: selected
            ? `0 0 0 1px ${accent}, 0 12px 40px rgba(0,0,0,0.5)`
            : '0 10px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />

      <div
        className="flex items-center gap-2 border-b px-3 pt-3 pb-2"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: config.bgColor, color: config.color }}
        >
          <StickyNote size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: accent }}>
            Canvas note
          </div>
          {editing ? (
            <input
              ref={titleInputRef}
              className="w-full mt-0.5 bg-transparent border-none outline-none text-[14px] font-semibold"
              style={{ color: 'var(--color-text)' }}
              value={title}
              autoFocus
              onChange={(e) => updateNodeData(id, { label: e.target.value })}
              onBlur={(e) => {
                const next = e.relatedTarget as HTMLElement | null;
                if (next?.tagName === 'TEXTAREA' && next === bodyAreaRef.current) return;
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  bodyAreaRef.current?.focus();
                }
              }}
            />
          ) : (
            <div className="text-[14px] font-semibold tracking-tight truncate" style={{ color: 'var(--color-text)' }}>
              {title}
            </div>
          )}
        </div>
      </div>

      <div
        className="px-3 py-2.5 max-h-[280px] overflow-y-auto custom-scrollbar"
        style={{ minHeight: 72 }}
      >
        {editing ? (
          <textarea
            ref={bodyAreaRef}
            className="w-full min-h-[140px] bg-[rgba(255,255,255,0.03)] rounded-lg border border-white/10 px-2 py-1.5 text-[11px] leading-relaxed outline-none focus:border-violet-400/40 resize-y font-mono"
            style={{ color: 'var(--color-text-muted)' }}
            value={body}
            onChange={(e) => updateNodeData(id, { body: e.target.value })}
            onBlur={(e) => {
              const next = e.relatedTarget as HTMLElement | null;
              if (next === titleInputRef.current) return;
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
        ) : (
          <div className="space-y-0.5">{renderBody()}</div>
        )}
      </div>

      {!editing && (
        <div
          className="px-3 pb-2 text-[9px] font-mono"
          style={{ color: 'var(--color-text-faint)' }}
        >
          Double-click to edit · drag handles to connect
        </div>
      )}
      </div>
    </div>
  );
});

const handleStyle: React.CSSProperties = {
  width: 11,
  height: 11,
  background: '#a78bfa',
  border: '2px solid #0a0a0f',
  boxShadow: '0 0 0 1px rgba(167,139,250,0.4)',
};

CanvasCardNode.displayName = 'CanvasCardNode';

export const nodeTypes = {
  route:          RouteNode,
  service:        ServiceNode,
  model:          ModelNode,
  schema:         SchemaNode,
  utility:        UtilityNode,
  app:            AppNode,
  module:         ModuleNode,
  entryInterface: EntryInterfaceNode,
  controller:     ControllerNode,
  diContainer:    DIContainerNode,
  repoInterface:  RepoInterfaceNode,
  domain:         DomainNode,
  repository:     RepositoryNode,
  canvasCard:     CanvasCardNode,
};

export const getNodeConfig = (type: string) => NODE_CONFIGS[type] || NODE_CONFIGS.utility;
export const NODE_TYPE_LIST = Object.keys(NODE_CONFIGS);

