import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileCode,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Layers,
  GitBranch,
  Hash,
  Gauge,
  FileText,
  Eye,
  Zap,
  Brain,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { getFileContent } from '@/services/fileSystem';
import { BACKEND_URL } from '@/services/apiClient';

interface ParsedFileData {
  file_type: string;
  line_count: number;
  complexity: number;
  classes: Array<{
    name: string;
    bases: string[];
    methods: string[];
    decorators: string[];
    docstring: string | null;
    line_number: number;
    role: string;
  }>;
  functions: Array<{
    name: string;
    args: string[];
    decorators: string[];
    line_number: number;
    is_route: boolean;
    is_async: boolean;
    complexity: number;
  }>;
  imports: Array<{
    module: string;
    names: string[];
    is_relative: boolean;
  }>;
}

interface FileDetailPanelProps {
  filepath: string | null;
  projectPath: string;
  framework?: string;
  allFiles?: string[];
  aiModel?: string;
  onClose: () => void;
  onOpenInEditor?: () => void;
}

type Tab = 'overview' | 'code' | 'ai' | 'env';

export const FileDetailPanel: React.FC<FileDetailPanelProps> = ({
  filepath,
  projectPath,
  framework,
  allFiles = [],
  aiModel,
  onClose,
  onOpenInEditor,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [content, setContent] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedFileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [promptPreview, setPromptPreview] = useState<string>('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  const isPython = !!filepath && filepath.endsWith('.py');
  const isEnvFile = !!filepath && (
    filepath.endsWith('.env') ||
    filepath.includes('/.env.') ||
    filepath.split('/').pop()?.match(/^\.env(\.[a-z]+)?$/) !== null
  );

  // Reset when file changes — Python files start on Overview, .env on Secrets, others on Source
  useEffect(() => {
    if (!filepath) return;
    if (filepath.endsWith('.py')) setTab('overview');
    else if (isEnvFile) setTab('env' as Tab);
    else setTab('code');
    setAiAnalysis('');
    setAiError(null);
    setParsed(null);
    setError(null);
    loadFile(filepath);
  }, [filepath]);

  const loadFile = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Try reading file content via File System Access API (browser) or Electron IPC
      let fileContent = await getFileContent(path);

      // 2. Fallback: read via backend if client-side access failed
      if (fileContent === null && projectPath) {
        try {
          const params = new URLSearchParams({ path, project_root: projectPath });
          const res = await fetch(`${BACKEND_URL}/parser/file/content?${params}`);
          if (res.ok) {
            const data = await res.json();
            if (data.error) {
              if (data.error === 'not_found') {
                setError('File not found. The project may have changed since the last scan. Try re-analyzing with Ctrl+R.');
              } else if (data.error === 'permission_denied') {
                setError('Permission denied reading this file.');
              } else if (data.error === 'encoding_error') {
                setError('This file uses an unsupported encoding.');
              } else {
                setError(data.message || 'Cannot read file.');
              }
              setLoading(false);
              return;
            }
            fileContent = data.content;
          }
        } catch {
          // Backend also failed
        }
      }

      if (fileContent === null) {
        setError('Cannot read file — re-open the project folder to grant access again.');
        setLoading(false);
        return;
      }
      setContent(fileContent);

      // 2. Parse via backend — only for Python files
      if (path.endsWith('.py')) {
        try {
          const response = await fetch(`${BACKEND_URL}/parser/parse-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content: fileContent }),
          });
          if (response.ok) {
            const data = await response.json();
            setParsed(data);
          }
        } catch {
          // Backend parse failed but we have content
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const runDeepAnalysis = async () => {
    if (!filepath || !content) return;

    setAiStreaming(true);
    setAiError(null);
    setAiAnalysis('');

    try {
      const response = await fetch(`${BACKEND_URL}/file-insight/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath,
          content,
          model: aiModel || undefined,
          framework,
          project_context: allFiles.slice(0, 30),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail || '';
        if (response.status === 400 && detail.includes('API key')) {
          throw new Error('OpenRouter API key not configured. Go to Settings to set your key.');
        }
        throw new Error(detail || 'Analysis service unavailable. Try again.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        // Parse SSE chunks
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              // Check for error field — show friendly message, not raw error
              if (parsed.error) {
                const raw = String(parsed.error);
                // Filter noisy processing / intermediary messages
                if (/processing|pending|queued/i.test(raw)) continue;
                const friendly = /api.?key|auth/i.test(raw) ? 'API key issue. Check Settings.' : raw;
                setAiError(friendly);
                continue;
              }
              // Standard OpenAI-compatible delta
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                setAiAnalysis((prev) => prev + delta);
              }
            } catch {
              // Not JSON — append raw text (some providers stream plain text)
              if (data && data !== '[DONE]') setAiAnalysis((prev) => prev + data);
            }
          }
        }
      }
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiStreaming(false);
    }
  };

  const previewPrompt = async () => {
    if (!filepath || !content) return;
    try {
      const response = await fetch(`${BACKEND_URL}/file-insight/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath,
          content,
          framework,
          project_context: allFiles.slice(0, 30),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setPromptPreview(data.prompt);
        setShowPromptPreview(true);
      }
    } catch (e) {
      console.error('Prompt preview failed', e);
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(promptPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openInEditor = () => {
    if (!filepath) return;
    if (onOpenInEditor) onOpenInEditor();
  };

  if (!filepath) return null;

  const filename = filepath.split('/').pop() || filepath;
  const dirPath = filepath.substring(0, filepath.length - filename.length).replace(/\/$/, '');

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[480px] flex flex-col z-30 surface-elevated border-l"
         style={{ 
           borderColor: 'var(--color-border-strong)',
           borderRadius: 0,
           background: 'var(--color-surface)',
         }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between shrink-0"
           style={{ borderColor: 'var(--color-border)' }}>
        <div className="min-w-0 flex-1">
          <div className="mono-label mb-0.5">FILE</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <FileCode className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
            <span className="text-[13px] font-semibold truncate">{filename}</span>
          </div>
          {dirPath && (
            <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {dirPath}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/5 transition-colors flex-shrink-0"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        {isPython && (
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Eye className="w-3.5 h-3.5" />} label="Overview" />
        )}
        {isEnvFile && (
          <TabButton active={tab === ('env' as Tab)} onClick={() => setTab('env' as Tab)} icon={<Hash className="w-3.5 h-3.5" />} label="Secrets" />
        )}
        <TabButton active={tab === 'code'} onClick={() => setTab('code')} icon={<FileText className="w-3.5 h-3.5" />} label="Source" />
        {isPython && (
          <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Brain className="w-3.5 h-3.5" />} label="AI Analysis" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
            <div className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
              Reading file from disk...
            </div>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div
              className="p-3 rounded-md text-[12px] border flex items-start gap-2"
              style={{
                background: 'rgba(239,68,68,0.06)',
                borderColor: 'rgba(239,68,68,0.25)',
                color: '#f87171',
              }}
            >
              <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold mb-1">Cannot read file</div>
                <div className="text-[11px] opacity-90 break-words">{error}</div>
                <button
                  onClick={() => filepath && loadFile(filepath)}
                  className="mt-2 text-[11px] underline hover:no-underline"
                  style={{ color: '#f87171' }}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'overview' && parsed && (
          <OverviewTab parsed={parsed} filepath={filepath} />
        )}

        {!loading && !error && (tab as string) === 'env' && (
          <EnvViewer content={content} filename={filename} />
        )}

        {!loading && !error && tab === 'code' && (
          <CodeTab content={content} onCopy={copyContent} copied={copied} />
        )}

        {!loading && !error && tab === 'ai' && (
          <AiTab
            analysis={aiAnalysis}
            streaming={aiStreaming}
            error={aiError}
            onRun={runDeepAnalysis}
            onPreviewPrompt={previewPrompt}
            aiModel={aiModel}
            promptPreview={promptPreview}
            showPromptPreview={showPromptPreview}
            onClosePromptPreview={() => setShowPromptPreview(false)}
            onCopyPrompt={copyPrompt}
            copied={copied}
          />
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t flex items-center gap-1.5 shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={openInEditor}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}
          title="Open the full project folder with VS Code (only when clicked)."
        >
          <ExternalLink className="w-3 h-3" />
          Open Project with VS Code
        </button>
        <button
          onClick={copyContent}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy source'}
        </button>
        <div className="flex-1" />
        {parsed && (
          <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
            {parsed.line_count} lines · cx {parsed.complexity}
          </span>
        )}
      </div>
    </div>
  );
};

function TabButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-all relative"
      style={{
        color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
        background: active ? 'var(--color-surface-hover)' : 'transparent',
      }}
    >
      {icon}
      {label}
      {active && (
        <span
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: 'var(--color-accent)' }}
        />
      )}
    </button>
  );
}

function OverviewTab({ parsed, filepath }: { parsed: ParsedFileData; filepath: string }) {
  const complexityColor =
    parsed.complexity > 20 ? '#f87171' :
    parsed.complexity > 10 ? '#fbbf24' :
    '#4ade80';

  return (
    <div className="p-4 space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCell icon={<Hash className="w-3 h-3" />} label="TYPE" value={parsed.file_type} />
        <StatCell icon={<FileText className="w-3 h-3" />} label="LINES" value={String(parsed.line_count)} />
        <StatCell icon={<Gauge className="w-3 h-3" />} label="COMPLEXITY" value={String(parsed.complexity)} color={complexityColor} />
      </div>

      {/* Classes */}
      {parsed.classes.length > 0 && (
        <Section title={`CLASSES · ${parsed.classes.length}`} icon={<Layers className="w-3 h-3" />}>
          <div className="space-y-2">
            {parsed.classes.map((cls, i) => (
              <div key={i} className="surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-[13px] truncate">{cls.name}</span>
                    {cls.role !== 'class' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
                        {cls.role.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    L{cls.line_number}
                  </span>
                </div>
                {cls.bases.length > 0 && (
                  <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    extends <span style={{ color: 'var(--color-text)' }}>{cls.bases.join(', ')}</span>
                  </div>
                )}
                {cls.docstring && (
                  <div className="text-[11px] mt-2 italic line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                    {cls.docstring}
                  </div>
                )}
                {cls.methods.length > 0 && (
                  <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="mono-label mb-1.5" style={{ fontSize: 9 }}>
                      METHODS · {cls.methods.length}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {cls.methods.slice(0, 12).map((m, j) => (
                        <span
                          key={j}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)' }}
                        >
                          {m}()
                        </span>
                      ))}
                      {cls.methods.length > 12 && (
                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                          +{cls.methods.length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Functions */}
      {parsed.functions.length > 0 && (
        <Section title={`FUNCTIONS · ${parsed.functions.length}`} icon={<GitBranch className="w-3 h-3" />}>
          <div className="space-y-1.5">
            {parsed.functions.map((fn, i) => (
              <div key={i} className="surface px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {fn.is_async && (
                    <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                      ASYNC
                    </span>
                  )}
                  {fn.is_route && (
                    <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded"
                          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                      ROUTE
                    </span>
                  )}
                  <span className="font-mono text-[12px] truncate">{fn.name}()</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  <span>cx {fn.complexity}</span>
                  <span>L{fn.line_number}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Imports */}
      {parsed.imports.length > 0 && (
        <Section title={`IMPORTS · ${parsed.imports.length}`} icon={<Zap className="w-3 h-3" />} collapsible defaultOpen={false}>
          <div className="space-y-1 font-mono text-[11px]">
            {parsed.imports.map((imp, i) => (
              <div key={i} className="flex gap-2">
                <span style={{ color: 'var(--color-text-faint)' }}>from</span>
                <span style={{ color: imp.is_relative ? 'var(--color-warning)' : 'var(--color-text)' }}>
                  {imp.module}
                </span>
                <span style={{ color: 'var(--color-text-faint)' }}>import</span>
                <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {imp.names.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {parsed.classes.length === 0 && parsed.functions.length === 0 && (
        <div className="text-center py-8 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          This file has no top-level classes or functions.
        </div>
      )}
    </div>
  );
}

function StatCell({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="surface p-2.5">
      <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--color-text-muted)' }}>
        {icon}
        <span className="mono-label" style={{ fontSize: 9 }}>{label}</span>
      </div>
      <div className="text-[14px] font-semibold font-mono numeric truncate" style={{ color: color || 'var(--color-text)' }}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={collapsible ? () => setOpen(!open) : undefined}
        className="flex items-center gap-1.5 mb-2 w-full"
        style={{ color: 'var(--color-text-muted)', cursor: collapsible ? 'pointer' : 'default' }}
      >
        {collapsible && (
          open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
        )}
        {icon}
        <span className="mono-label">{title}</span>
      </button>
      {(!collapsible || open) && children}
    </div>
  );
}

function CodeTab({ content, onCopy, copied }: { content: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="relative">
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded text-[10px] font-mono border hover:bg-white/5 transition-colors"
        style={{
          borderColor: 'var(--color-border-strong)',
          color: 'var(--color-text-muted)',
          background: 'var(--color-surface)',
        }}
      >
        {copied ? (
          <span className="flex items-center gap-1">
            <Check className="w-2.5 h-2.5" />
            COPIED
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Copy className="w-2.5 h-2.5" />
            COPY
          </span>
        )}
      </button>
      <pre
        className="p-4 font-mono text-[12px] leading-relaxed overflow-x-auto"
        style={{
          color: 'var(--color-text)',
          background: 'var(--color-bg)',
          whiteSpace: 'pre',
          minHeight: '100%',
        }}
      >
        <code>{content || '(empty file)'}</code>
      </pre>
    </div>
  );
}

function AiTab({
  analysis,
  streaming,
  error,
  onRun,
  onPreviewPrompt,
  aiModel,
  promptPreview,
  showPromptPreview,
  onClosePromptPreview,
  onCopyPrompt,
  copied,
}: {
  analysis: string;
  streaming: boolean;
  error: string | null;
  onRun: () => void;
  onPreviewPrompt: () => void;
  aiModel?: string;
  promptPreview: string;
  showPromptPreview: boolean;
  onClosePromptPreview: () => void;
  onCopyPrompt: () => void;
  copied: boolean;
}) {
  const hasAi = !!aiModel;

  if (showPromptPreview) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="mono-label">GENERATED PROMPT</div>
          <button
            onClick={onClosePromptPreview}
            className="text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ← Back
          </button>
        </div>
        <div className="surface p-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
            {promptPreview}
          </pre>
        </div>
        <button
          onClick={onCopyPrompt}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[12px] font-medium border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied — paste into any AI' : 'Copy prompt to clipboard'}
        </button>
      </div>
    );
  }

  if (!analysis && !streaming) {
    return (
      <div className="p-4 space-y-4">
        {/* Hero */}
        <div className="surface p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                 style={{ background: 'var(--color-accent-dim)' }}>
              <Sparkles className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            </div>
            <div>
              <div className="text-[14px] font-semibold">Deep architectural analysis</div>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Sends this file's AST + source to AI with a structured prompt that asks for purpose,
                design patterns, risks, and concrete refactoring suggestions.
              </p>
            </div>
          </div>
        </div>

        {/* What it includes */}
        <div className="space-y-1.5">
          <div className="mono-label mb-1">THE PROMPT ASKS FOR</div>
          {[
            { label: 'Purpose', desc: 'One-sentence responsibility' },
            { label: 'Architecture Role', desc: 'Which layer and why' },
            { label: 'Key Abstractions', desc: 'Line per class/function' },
            { label: 'Design Patterns', desc: 'Only ones actually present' },
            { label: 'Dependencies & Coupling', desc: 'Inbound / outbound / score' },
            { label: 'Risks & Smells', desc: 'With specific symbol references' },
            { label: 'Refactoring Suggestions', desc: 'Ranked by impact' },
            { label: 'Questions Worth Asking', desc: 'Validation prompts' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <span className="w-4 text-[10px] font-mono mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
                0{i + 1}
              </span>
              <div className="flex-1">
                <div className="text-[12px] font-medium">{item.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Action */}
        {hasAi ? (
          <div className="space-y-2 pt-2">
            <button
              onClick={onRun}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all"
              style={{
                background: 'var(--color-accent)',
                color: 'white',
                boxShadow: '0 4px 16px var(--color-accent-glow)',
              }}
            >
              <Brain className="w-4 h-4" />
              Run deep analysis
            </button>
            <div className="text-[10px] text-center font-mono" style={{ color: 'var(--color-text-faint)' }}>
              using {aiModel}
            </div>
            <button
              onClick={onPreviewPrompt}
              className="w-full px-3 py-2 rounded-md text-[11px] font-mono border hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}
            >
              Preview/copy prompt (use your own AI)
            </button>
          </div>
        ) : (
          <div className="surface p-3">
            <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--color-warning)' }}>
              AI disabled
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Select a model on the home page, or click below to copy the prompt and run it in
              ChatGPT, Claude, or any AI of your choice.
            </div>
            <button
              onClick={onPreviewPrompt}
              className="mt-3 w-full px-3 py-2 rounded-md text-[12px] font-medium border hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--color-border-strong)' }}
            >
              Generate prompt
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {streaming && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-mono"
             style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{analysis.length > 200 ? 'Generating insights...' : analysis.length > 0 ? 'Processing architecture...' : 'Analyzing project...'}</span>
        </div>
      )}
      {error && (
        <div className="surface p-3 text-[12px]" style={{ color: 'var(--color-danger)' }}>
          {error}
          <button
            onClick={onRun}
            className="block mt-2 text-[11px] underline"
            style={{ color: 'var(--color-accent)' }}
          >
            Try again
          </button>
        </div>
      )}
      {analysis && (
        <div
          className="text-[12.5px] leading-relaxed"
          style={{ color: 'var(--color-text)' }}
        >
          <MarkdownRenderer content={analysis} />
        </div>
      )}
      {!streaming && analysis && (
        <button
          onClick={onRun}
          className="w-full mt-4 px-3 py-2 rounded-md text-[11px] font-mono border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}
        >
          Re-run analysis
        </button>
      )}
    </div>
  );
}

/**
 * Minimal markdown renderer — handles headings, bold, inline code, lists, and paragraphs.
 * Lightweight; no deps.
 */
function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => {
    const lines = content.split('\n');
    const out: string[] = [];
    let inList = false;

    for (let raw of lines) {
      const line = raw.trimEnd();

      if (line.startsWith('### ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<h3 class="md-h3">${escape(line.slice(4))}</h3>`);
      } else if (line.startsWith('## ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<h2 class="md-h2">${escape(line.slice(3))}</h2>`);
      } else if (line.startsWith('# ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<h1 class="md-h1">${escape(line.slice(2))}</h1>`);
      } else if (line.match(/^[-*]\s/)) {
        if (!inList) { out.push('<ul class="md-ul">'); inList = true; }
        out.push(`<li class="md-li">${inlineFormat(line.slice(2))}</li>`);
      } else if (line === '') {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<div class="md-space"></div>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<p class="md-p">${inlineFormat(line)}</p>`);
      }
    }
    if (inList) out.push('</ul>');
    return out.join('');
  }, [content]);

  return (
    <>
      <style>{`
        .md-h1 { font-size: 18px; font-weight: 700; margin: 16px 0 8px; letter-spacing: -0.01em; }
        .md-h2 { font-size: 15px; font-weight: 700; margin: 18px 0 6px; letter-spacing: -0.01em; color: var(--color-accent); }
        .md-h3 { font-size: 13px; font-weight: 600; margin: 14px 0 4px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-muted); }
        .md-p { margin: 0 0 6px; line-height: 1.55; }
        .md-ul { margin: 4px 0 8px; padding-left: 18px; }
        .md-li { margin: 2px 0; line-height: 1.5; }
        .md-space { height: 4px; }
        .md-bold { font-weight: 600; color: var(--color-text); }
        .md-code { font-family: var(--font-mono); font-size: 11.5px; padding: 1px 5px; border-radius: 3px; background: var(--color-bg-subtle); border: 1px solid var(--color-border); }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(s: string): string {
  let out = escape(s);
  // bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<span class="md-bold">$1</span>');
  // inline code `text`
  out = out.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// .env File Viewer
// ─────────────────────────────────────────────────────────────────────────────

interface EnvVariable {
  key: string;
  value: string;
  is_sensitive: boolean;
  is_empty: boolean;
  comment?: string;
  line_number: number;
}

interface EnvSection {
  [section: string]: EnvVariable[];
}

interface EnvParseResult {
  variables: EnvVariable[];
  total: number;
  sensitive_count: number;
  empty_count: number;
  sections: EnvSection;
}

export function EnvViewer({ content, filename }: { content: string; filename: string }) {
  const [result, setResult] = React.useState<EnvParseResult | null>(null);
  const [showValues, setShowValues] = React.useState<Set<string>>(new Set());
  const [copyStates, setCopyStates] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!content) return;
    fetch('http://localhost:8000/advanced/env/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, filename }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setResult(data))
      .catch(() => {
        // Fallback: parse client-side
        const vars: EnvVariable[] = [];
        let lineNum = 0;
        for (const rawLine of content.split('\n')) {
          lineNum++;
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const eqIdx = line.indexOf('=');
          if (eqIdx < 0) continue;
          const key = line.slice(0, eqIdx).trim();
          let value = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          const isSensitive = /password|secret|key|token|auth|credential|private|pwd|api/i.test(key);
          vars.push({ key, value, is_sensitive: isSensitive, is_empty: !value, line_number: lineNum });
        }
        setResult({
          variables: vars,
          total: vars.length,
          sensitive_count: vars.filter(v => v.is_sensitive).length,
          empty_count: vars.filter(v => v.is_empty).length,
          sections: { General: vars },
        });
      });
  }, [content, filename]);

  const toggleReveal = (key: string) => {
    setShowValues(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copyValue = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopyStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopyStates(prev => ({ ...prev, [key]: false })), 1200);
  };

  if (!result) {
    return (
      <div className="p-4 flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Parsing environment file...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="surface px-3 py-2 text-center">
          <div className="text-[18px] font-bold" style={{ color: 'var(--color-accent)' }}>{result.total}</div>
          <div className="text-[9px] font-mono uppercase text-white/40 mt-0.5">Variables</div>
        </div>
        <div className="surface px-3 py-2 text-center">
          <div className="text-[18px] font-bold text-amber-400">{result.sensitive_count}</div>
          <div className="text-[9px] font-mono uppercase text-white/40 mt-0.5">Sensitive</div>
        </div>
        <div className="surface px-3 py-2 text-center">
          <div className="text-[18px] font-bold" style={{ color: result.empty_count > 0 ? '#f87171' : '#4ade80' }}>
            {result.empty_count}
          </div>
          <div className="text-[9px] font-mono uppercase text-white/40 mt-0.5">Empty</div>
        </div>
      </div>

      {/* Security warning if sensitive keys have empty values */}
      {result.variables.some(v => v.is_sensitive && v.is_empty) && (
        <div className="flex items-start gap-2 p-3 rounded-md text-[11px]"
             style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span className="text-amber-400 mt-0.5">⚠</span>
          <div style={{ color: '#fde68a' }}>
            Some sensitive keys are empty — make sure to fill them before deploying.
          </div>
        </div>
      )}

      {/* Sections */}
      {Object.entries(result.sections).map(([section, vars]) => (
        <div key={section}>
          <div className="mono-label mb-2">{section.toUpperCase()}</div>
          <div className="space-y-1.5">
            {vars.map(v => {
              const revealed = showValues.has(v.key);
              const displayValue = v.is_empty
                ? '(empty)'
                : v.is_sensitive && !revealed
                  ? '••••••••••••'
                  : v.value;
              return (
                <div
                  key={v.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-md group"
                  style={{
                    background: v.is_empty
                      ? 'rgba(248,113,113,0.06)'
                      : v.is_sensitive
                        ? 'rgba(251,191,36,0.04)'
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${
                      v.is_empty ? 'rgba(248,113,113,0.15)' :
                      v.is_sensitive ? 'rgba(251,191,36,0.12)' :
                      'rgba(255,255,255,0.06)'
                    }`,
                  }}
                >
                  {/* Lock icon for sensitive */}
                  <span className="text-[10px] w-3 flex-shrink-0">
                    {v.is_sensitive ? '🔑' : ''}
                  </span>
                  {/* Key */}
                  <code className="text-[11px] font-mono font-medium flex-shrink-0 min-w-0 truncate"
                        style={{ color: v.is_sensitive ? '#fde68a' : 'var(--color-accent)', maxWidth: '45%' }}>
                    {v.key}
                  </code>
                  <span className="text-white/20 text-[10px]">=</span>
                  {/* Value */}
                  <code className="text-[11px] font-mono flex-1 min-w-0 truncate"
                        style={{ color: v.is_empty ? '#f87171' : v.is_sensitive && !revealed ? '#64748b' : 'var(--color-text)' }}>
                    {displayValue}
                  </code>
                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {v.is_sensitive && !v.is_empty && (
                      <button
                        onClick={() => toggleReveal(v.key)}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10"
                        style={{ color: 'var(--color-text-muted)' }}
                        title={revealed ? 'Hide value' : 'Reveal value'}
                      >
                        {revealed ? <Eye className="w-3 h-3" /> : <Eye className="w-3 h-3 opacity-40" />}
                      </button>
                    )}
                    {!v.is_empty && (
                      <button
                        onClick={() => copyValue(v.key, v.value)}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10"
                        style={{ color: 'var(--color-text-muted)' }}
                        title="Copy value"
                      >
                        {copyStates[v.key] ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
