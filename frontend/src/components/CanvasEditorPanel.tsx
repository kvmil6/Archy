/**
 * Part 2 — Canvas Editing Panel.
 *
 * Full-height sliding editor panel (right side, ~50vw) with Monaco Editor.
 * Features: Save (Ctrl+S), Format, AI Fix, Close.
 * Save writes atomically via POST /editor/write, then re-parses the single file.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  X,
  Save,
  Wand2,
  AlignLeft,
  Loader2,
  Check,
  Send,
  Undo2,
  CheckCircle2,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { getFileContent } from '@/services/fileSystem';
import { useToast } from '@/components/Toast';

// ── Language detection ──────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript',
  tsx: 'typescript', json: 'json', html: 'html', css: 'css', scss: 'scss',
  md: 'markdown', yaml: 'yaml', yml: 'yaml', toml: 'ini', cfg: 'ini',
  txt: 'plaintext', sql: 'sql', sh: 'shell', bash: 'shell',
  dockerfile: 'dockerfile', xml: 'xml', graphql: 'graphql',
};

function detectLanguage(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase() ?? '';
  const name = filepath.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  return EXT_TO_LANG[ext] ?? 'plaintext';
}

function getFriendlyAIError(status?: number, detail?: string): string {
  const text = String(detail || '').toLowerCase();
  if (status === 400 || text.includes('not configured')) {
    return 'OpenRouter API key is not configured. Add it in settings first.';
  }
  if (status === 401 || status === 403 || text.includes('api key')) {
    return 'OpenRouter rejected the API key. Verify backend/.env and try again.';
  }
  if (status === 402 || text.includes('payment required') || text.includes('billing')) {
    return 'OpenRouter billing issue (Payment Required). Add credits or switch to a free model.';
  }
  if (status === 429 || text.includes('rate limit')) {
    return 'OpenRouter rate limit reached. Wait a moment and retry.';
  }
  if (status === 504 || text.includes('timed out')) {
    return 'AI request timed out. Try a shorter prompt.';
  }
  if (status === 502 || text.includes('model not found')) {
    return detail || 'Selected model is unavailable. Choose a different model and retry.';
  }
  return detail || 'AI request failed. Please try again.';
}

// ── Types ───────────────────────────────────────────────────────────

interface CanvasEditorPanelProps {
  filepath: string | null;
  projectPath: string;
  framework?: string;
  model?: string;
  /** Summary of the node from the graph (for AI Fix context) */
  nodeSummary?: string;
  onClose: () => void;
  /** Called after a successful save+reparse so the graph can merge updates */
  onFileSaved?: (filepath: string) => void;
  /** Line to scroll to on open */
  scrollToLine?: number;
}

export const CanvasEditorPanel: React.FC<CanvasEditorPanelProps> = ({
  filepath,
  projectPath,
  framework = 'unknown',
  model,
  nodeSummary,
  onClose,
  onFileSaved,
  scrollToLine,
}) => {
  const toast = useToast();
  const editorRef = useRef<any>(null);
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Fix state
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const language = filepath ? detectLanguage(filepath) : 'plaintext';
  const filename = filepath?.split('/').pop() ?? '';

  // ── Load file content ─────────────────────────────────────────────

  useEffect(() => {
    if (!filepath) return;
    setLoading(true);
    setError(null);
    setDirty(false);
    setAiResult(null);
    setShowDiff(false);
    setShowAIPrompt(false);

    (async () => {
      try {
        // Try client-side first
        let text = await getFileContent(filepath);

        // Fallback to backend
        if (text === null && projectPath) {
          const params = new URLSearchParams({ path: filepath, project_root: projectPath });
          const res = await fetch(`${BACKEND_URL}/parser/file/content?${params}`);
          if (res.ok) {
            const data = await res.json();
            if (data.error) throw new Error(data.message || data.error);
            text = data.content;
          }
        }

        if (text === null) throw new Error('Cannot read file');
        setContent(text);
        setOriginalContent(text);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [filepath, projectPath]);

  // ── Monaco mount ──────────────────────────────────────────────────

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    if (scrollToLine && scrollToLine > 0) {
      editor.revealLineInCenter(scrollToLine);
      editor.setPosition({ lineNumber: scrollToLine, column: 1 });
    }
  };

  const handleContentChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setDirty(value !== originalContent);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────

  const saveFile = useCallback(async () => {
    if (!filepath || !dirty) return;
    setSaving(true);
    try {
      // 1. Atomic write
      const writeRes = await fetch(`${BACKEND_URL}/editor/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filepath, content, project_root: projectPath }),
      });
      if (!writeRes.ok) {
        const d = await writeRes.json().catch(() => ({}));
        throw new Error(d.detail || `Write failed: ${writeRes.status}`);
      }

      // 2. Re-parse single file
      try {
        await fetch(`${BACKEND_URL}/parser/parse-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filepath, content }),
        });
      } catch { /* non-critical */ }

      setOriginalContent(content);
      setDirty(false);
      toast.success('Saved and graph updated', filename);
      onFileSaved?.(filepath);
    } catch (e) {
      toast.error('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [filepath, content, dirty, projectPath, filename, toast, onFileSaved]);

  // ── Ctrl+S handler ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveFile]);

  // ── Format ────────────────────────────────────────────────────────

  const formatDocument = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  // ── AI Fix ────────────────────────────────────────────────────────

  const runAIFix = async () => {
    if (!aiPrompt.trim() || !filepath || !model) return;
    setAiLoading(true);
    setAiResult(null);

    const systemPrompt =
      `You are an expert Python developer reviewing a file in a ${framework} project. ` +
      `The file is ${filename}. Here is its role in the architecture: ${nodeSummary || 'General project file'}. ` +
      `The user wants you to: ${aiPrompt}. ` +
      `Return ONLY the complete updated file content, no explanation, no markdown fences.`;

    try {
      const res = await fetch(`${BACKEND_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content },
          ],
          stream: true,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(getFriendlyAIError(res.status, payload?.detail));
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let result = '';
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              streamError = getFriendlyAIError(parsed.status_code, String(parsed.error));
              break;
            }
            if (parsed.type === 'usage') continue;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) result += delta;
          } catch { /* skip */ }
        }
        if (streamError) break;
      }

      if (streamError) {
        throw new Error(streamError);
      }

      if (result.trim()) {
        // Strip markdown fences if AI included them anyway
        let cleaned = result.trim();
        if (cleaned.startsWith('```')) {
          const firstNewline = cleaned.indexOf('\n');
          cleaned = cleaned.slice(firstNewline + 1);
          if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3).trimEnd();
        }
        setAiResult(cleaned);
        setShowDiff(true);
      } else {
        toast.warning('AI returned empty response', 'Try a different prompt');
      }
    } catch (e) {
      toast.error('AI Fix failed', (e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const acceptDiff = () => {
    if (aiResult) {
      setContent(aiResult);
      setDirty(aiResult !== originalContent);
      setShowDiff(false);
      setAiResult(null);
      setShowAIPrompt(false);
      setAiPrompt('');
    }
  };

  const rejectDiff = () => {
    setShowDiff(false);
    setAiResult(null);
  };

  if (!filepath) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl"
      style={{ width: '50vw', minWidth: 480 }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold truncate">{filename}</span>
          {dirty && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/20">
              MODIFIED
            </span>
          )}
          <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {language}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Save */}
          <button
            onClick={saveFile}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: dirty ? '#4ade80' : 'var(--color-text-muted)' }}
            title="Save (Ctrl+S)"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>

          {/* Format */}
          <button
            onClick={formatDocument}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-muted)' }}
            title="Format document"
          >
            <AlignLeft className="w-3.5 h-3.5" />
            Format
          </button>

          {/* AI Fix */}
          {model && (
            <button
              onClick={() => setShowAIPrompt(!showAIPrompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors hover:bg-white/5"
              style={{ color: showAIPrompt ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
              title="AI Fix — describe what to fix or improve"
            >
              <Wand2 className="w-3.5 h-3.5" />
              AI Fix
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Close editor"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* ── AI Fix prompt bar ────────────────────────────────────── */}
      {showAIPrompt && !showDiff && (
        <div className="border-b border-white/10 px-4 py-2.5 flex items-center gap-2 bg-surface-800/30 shrink-0">
          <Wand2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runAIFix()}
            placeholder="Describe what to fix or improve..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-purple-500/50"
            autoFocus
          />
          <button
            onClick={runAIFix}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-40 transition-colors border border-purple-500/20"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* ── Diff Accept/Reject bar ───────────────────────────────── */}
      {showDiff && aiResult && (
        <div className="border-b border-white/10 px-4 py-2 flex items-center justify-between bg-purple-950/20 shrink-0">
          <span className="text-[12px] text-purple-300">
            AI suggested changes — review below
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={acceptDiff}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/20 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Accept
            </button>
            <button
              onClick={rejectDiff}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/20 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Editor area ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span className="text-[11px] font-mono text-white/40">Loading file...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
            <X className="w-6 h-6 text-red-400" />
            <span className="text-[12px] text-red-300 text-center">{error}</span>
          </div>
        ) : showDiff && aiResult ? (
          /* Show before/after side by side using two Monaco instances */
          <div className="flex h-full">
            <div className="flex-1 border-r border-white/10 flex flex-col">
              <div className="px-3 py-1 text-[10px] font-mono text-white/30 bg-surface-800/30 shrink-0">Original</div>
              <div className="flex-1 min-h-0">
                <Editor
                  language={language}
                  value={content}
                  theme="vs-dark"
                  options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, fontSize: 13 }}
                />
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              <div className="px-3 py-1 text-[10px] font-mono text-purple-300 bg-purple-950/20 shrink-0">AI Suggestion</div>
              <div className="flex-1 min-h-0">
                <Editor
                  language={language}
                  value={aiResult}
                  theme="vs-dark"
                  options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, fontSize: 13 }}
                />
              </div>
            </div>
          </div>
        ) : (
          <Editor
            language={language}
            value={content}
            theme="vs-dark"
            onChange={handleContentChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: true },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              fontSize: 13,
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 8 },
              tabSize: 4,
              renderWhitespace: 'selection',
              smoothScrolling: true,
            }}
          />
        )}
      </div>

      {/* ── Status bar ───────────────────────────────────────────── */}
      <div className="h-7 border-t border-white/10 flex items-center justify-between px-4 bg-surface-800/50 shrink-0 text-[10px] font-mono text-white/30">
        <div className="flex items-center gap-3">
          <span>{language}</span>
          <span>{content.split('\n').length} lines</span>
          {dirty && <span className="text-amber-300">unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          <span>UTF-8</span>
          <span>Ctrl+S to save</span>
        </div>
      </div>
    </div>
  );
};
