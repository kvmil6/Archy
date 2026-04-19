import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Shield,
  FileCode,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { getFileContent } from '@/services/fileSystem';

interface EnvEntry {
  key: string;
  value: string;
  isSensitive: boolean;
}

interface EnvFile {
  path: string;
  filename: string;
  entries: EnvEntry[];
  rawContent: string;
}

interface EnvPanelProps {
  isOpen: boolean;
  onClose: () => void;
  files: string[];
}

const SENSITIVE_PATTERNS = [
  /key/i, /secret/i, /password/i, /passwd/i, /token/i, /auth/i,
  /credential/i, /private/i, /api_key/i, /apikey/i, /access/i,
  /database_url/i, /db_pass/i, /jwt/i, /signing/i, /encrypt/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

function parseEnvContent(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push({ key, value, isSensitive: isSensitiveKey(key) });
  }
  return entries;
}

function maskValue(value: string): string {
  if (value.length <= 4) return '••••';
  return value.slice(0, 2) + '•'.repeat(Math.min(value.length - 4, 16)) + value.slice(-2);
}

export const EnvPanel: React.FC<EnvPanelProps> = ({ isOpen, onClose, files }) => {
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const envFilePaths = useMemo(() => {
    return files.filter((f) => {
      const name = f.split('/').pop()?.toLowerCase() || '';
      return name.startsWith('.env') || name === '.env';
    });
  }, [files]);

  useEffect(() => {
    if (!isOpen || envFilePaths.length === 0) return;
    loadEnvFiles();
  }, [isOpen, envFilePaths]);

  const loadEnvFiles = async () => {
    setLoading(true);
    const loaded: EnvFile[] = [];
    for (const path of envFilePaths) {
      try {
        const content = await getFileContent(path);
        if (content) {
          loaded.push({
            path,
            filename: path.split('/').pop() || path,
            entries: parseEnvContent(content),
            rawContent: content,
          });
        }
      } catch {
        // skip unreadable files
      }
    }
    setEnvFiles(loaded);
    if (loaded.length > 0) {
      setExpandedFiles(new Set([loaded[0].path]));
    }
    setLoading(false);
  };

  const toggleReveal = (fileKey: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  };

  const copyValue = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (!isOpen) return null;

  const sensitiveCount = envFiles.reduce(
    (sum, f) => sum + f.entries.filter((e) => e.isSensitive).length,
    0,
  );
  const totalVars = envFiles.reduce((sum, f) => sum + f.entries.length, 0);

  return (
    <div
      className="fixed inset-y-0 right-0 w-96 z-50 flex flex-col"
      style={{
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border-strong)',
        boxShadow: '0 0 60px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div
        className="h-14 border-b flex items-center justify-between px-4 shrink-0"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(74,222,128,0.15)' }}
          >
            <Shield className="w-4 h-4" style={{ color: '#4ade80' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Environment Variables
            </h3>
            <p className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {envFiles.length} file{envFiles.length !== 1 ? 's' : ''} · {totalVars} vars
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Security banner */}
      {sensitiveCount > 0 && (
        <div
          className="mx-3 mt-3 rounded-lg p-3 flex items-start gap-2.5"
          style={{
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.15)',
          }}
        >
          <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <div>
            <p className="text-[11px] font-medium" style={{ color: '#fde68a' }}>
              {sensitiveCount} sensitive variable{sensitiveCount !== 1 ? 's' : ''} detected
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Values are masked by default. Click the eye icon to reveal.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div
              className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--color-border-strong)', borderTopColor: '#4ade80' }}
            />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Scanning .env files...
            </p>
          </div>
        ) : envFiles.length === 0 ? (
          <div className="text-center py-12">
            <FileCode className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              No .env files found
            </p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
              Add a .env file to your project root to see variables here
            </p>
          </div>
        ) : (
          envFiles.map((envFile) => {
            const isExpanded = expandedFiles.has(envFile.path);
            return (
              <div
                key={envFile.path}
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--color-border)' }}
              >
                {/* File header */}
                <button
                  onClick={() => toggleFile(envFile.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  )}
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(74,222,128,0.15)' }}
                  >
                    <FileCode className="w-3 h-3" style={{ color: '#4ade80' }} />
                  </div>
                  <span className="text-[12px] font-medium font-mono flex-1 text-left" style={{ color: 'var(--color-text)' }}>
                    {envFile.filename}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    {envFile.entries.length} vars
                  </span>
                </button>

                {/* Entries */}
                {isExpanded && (
                  <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    {envFile.entries.map((entry) => {
                      const uniqueKey = `${envFile.path}:${entry.key}`;
                      const isRevealed = revealedKeys.has(uniqueKey);
                      const isCopied = copiedKey === uniqueKey;
                      return (
                        <div
                          key={uniqueKey}
                          className="flex items-center gap-2 px-3 py-2 group transition-colors hover:bg-white/5"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        >
                          {/* Sensitivity indicator */}
                          {entry.isSensitive ? (
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: '#fbbf24' }} />
                          ) : (
                            <div className="w-3 h-3 flex-shrink-0" />
                          )}

                          {/* Key */}
                          <span
                            className="text-[11px] font-mono font-medium min-w-0 shrink-0"
                            style={{ color: entry.isSensitive ? '#fde68a' : '#a78bfa' }}
                          >
                            {entry.key}
                          </span>

                          <span className="text-[10px] mx-1" style={{ color: 'var(--color-text-faint)' }}>
                            =
                          </span>

                          {/* Value */}
                          <span
                            className="text-[11px] font-mono flex-1 min-w-0 truncate"
                            style={{ color: 'var(--color-text-muted)' }}
                            title={isRevealed ? entry.value : 'Click eye to reveal'}
                          >
                            {entry.isSensitive && !isRevealed ? maskValue(entry.value) : entry.value}
                          </span>

                          {/* Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            {entry.isSensitive && (
                              <button
                                onClick={() => toggleReveal(uniqueKey)}
                                className="p-1 rounded hover:bg-white/10 transition-colors"
                                title={isRevealed ? 'Hide value' : 'Reveal value'}
                              >
                                {isRevealed ? (
                                  <EyeOff className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                                ) : (
                                  <Eye className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => copyValue(uniqueKey, entry.value)}
                              className="p-1 rounded hover:bg-white/10 transition-colors"
                              title="Copy value"
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3" style={{ color: '#4ade80' }} />
                              ) : (
                                <Copy className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        className="h-10 border-t flex items-center justify-between px-4 shrink-0"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}
      >
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
          Values stay in-browser · never sent to server
        </span>
        <button
          onClick={loadEnvFiles}
          className="text-[10px] font-mono transition-colors hover:opacity-80"
          style={{ color: 'var(--color-accent)' }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
};
