import React, { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
  AlertTriangle,
  Lock,
  Eye,
  FileCode,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { getFileContent } from '@/services/fileSystem';

interface SecurityFinding {
  severity: string;
  category: string;
  file: string;
  line: number | null;
  description: string;
  suggestion: string;
}

interface SecurityResult {
  score: number;
  findings: SecurityFinding[];
  summary: string;
}

interface SecurityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  files: string[];
  framework?: string;
  model?: string;
}

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25' },
  high:     { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/25' },
  medium:   { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25' },
  low:      { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25' },
  info:     { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/25' },
};

const severityIcons: Record<string, React.ReactNode> = {
  critical: <ShieldX className="w-3.5 h-3.5 text-red-400" />,
  high:     <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />,
  medium:   <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  low:      <Lock className="w-3.5 h-3.5 text-blue-400" />,
  info:     <Eye className="w-3.5 h-3.5 text-slate-400" />,
};

function generateHtmlReport(result: SecurityResult, framework: string, scannedCount: number): string {
  const now = new Date().toLocaleString();
  const sc = result.score;
  const scoreColor = sc >= 80 ? '#4ade80' : sc >= 60 ? '#fbbf24' : '#f87171';
  const scoreLabel = sc >= 90 ? 'Excellent' : sc >= 80 ? 'Good' : sc >= 60 ? 'Fair' : sc >= 40 ? 'Poor' : 'Critical';
  const sevC: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: 'rgba(239,68,68,0.1)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
    high:     { bg: 'rgba(249,115,22,0.1)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
    medium:   { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
    low:      { bg: 'rgba(96,165,250,0.1)', text: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
    info:     { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'rgba(148,163,184,0.3)' },
  };
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  result.findings.forEach(f => { const k = f.severity as keyof typeof counts; if (k in counts) counts[k]++; });
  const findingsHtml = result.findings.map(f => {
    const c = sevC[f.severity] || sevC.info;
    return `<div style="border:1px solid ${c.border};background:${c.bg};border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="color:${c.text};font-size:10px;font-family:monospace;font-weight:600;text-transform:uppercase;background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:4px;border:1px solid ${c.border};">${f.severity}</span>
        <span style="color:#94a3b8;font-size:11px;font-family:monospace;">${f.category}</span>
      </div>
      <div style="color:#e2e8f0;font-size:14px;font-weight:500;margin-bottom:6px;">${f.description}</div>
      <div style="color:#64748b;font-size:11px;font-family:monospace;margin-bottom:8px;">📁 ${f.file}${f.line ? `:${f.line}` : ''}</div>
      <div style="background:rgba(0,0,0,0.25);border-radius:6px;padding:10px;font-size:12px;color:#94a3b8;line-height:1.6;">
        <span style="color:#7c86ff;">💡</span> ${f.suggestion}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Archy Security Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0f;color:#e4e4e7;font-family:'Inter','Segoe UI',system-ui,sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;}
    .wrap{max-width:900px;margin:0 auto;padding:48px 24px}
    .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.06)}
    .meta{text-align:right;font-size:12px;color:#71717a;font-family:monospace;line-height:1.7}
    .score-row{display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:center;background:#13131a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;margin-bottom:32px}
    .ring{width:120px;height:120px;border-radius:50%;background:conic-gradient(${scoreColor} ${sc * 3.6}deg,rgba(255,255,255,0.06) ${sc * 3.6}deg);display:flex;align-items:center;justify-content:center}
    .inner{width:90px;height:90px;border-radius:50%;background:#0a0a0f;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .snum{font-size:28px;font-weight:700;font-family:monospace;color:${scoreColor};line-height:1}
    .slbl{font-size:24px;font-weight:600;color:${scoreColor};margin-bottom:8px}
    .summary{font-size:14px;color:#a1a1aa;line-height:1.6;margin-bottom:16px}
    .bdg{font-size:11px;font-family:monospace;font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid;display:inline-block;margin:2px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px}
    .sc{background:#13131a;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center}
    .sn{font-size:24px;font-weight:700;font-family:monospace}
    .sk{font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#52525b;margin-top:4px}
    .stitle{font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;color:#52525b;font-weight:600;margin-bottom:16px}
    .empty{text-align:center;padding:64px 32px;background:#13131a;border:1px solid rgba(74,222,128,0.15);border-radius:16px}
    .foot{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:12px;color:#52525b;font-family:monospace}
    @media(max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}.score-row{grid-template-columns:1fr;text-align:center}}
  </style>
</head>
<body><div class="wrap">
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:12px">
      <svg width="36" height="36" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="rgba(124,134,255,0.15)"/><path d="M8 16L16 8L24 16L16 24Z" fill="none" stroke="#7c86ff" stroke-width="1.5"/><circle cx="16" cy="16" r="3" fill="#7c86ff"/></svg>
      <div><div style="font-size:20px;font-weight:700">Archy</div><div style="font-size:11px;color:#71717a;font-family:monospace">Security Report</div></div>
    </div>
    <div class="meta"><div>Framework: <b style="color:#e4e4e7">${framework}</b></div><div>Files: <b style="color:#e4e4e7">${scannedCount}</b></div><div>${now}</div></div>
  </div>
  <div class="score-row">
    <div class="ring"><div class="inner"><div class="snum">${sc}</div><div style="font-size:10px;color:#71717a;font-family:monospace">/100</div></div></div>
    <div>
      <div class="slbl">${scoreLabel}</div>
      <div class="summary">${result.summary}</div>
      <div>
        ${counts.critical > 0 ? `<span class="bdg" style="color:#f87171;background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3)">${counts.critical} Critical</span>` : ''}
        ${counts.high > 0 ? `<span class="bdg" style="color:#fb923c;background:rgba(249,115,22,0.1);border-color:rgba(249,115,22,0.3)">${counts.high} High</span>` : ''}
        ${counts.medium > 0 ? `<span class="bdg" style="color:#fbbf24;background:rgba(251,191,36,0.1);border-color:rgba(251,191,36,0.3)">${counts.medium} Medium</span>` : ''}
        ${counts.low > 0 ? `<span class="bdg" style="color:#60a5fa;background:rgba(96,165,250,0.1);border-color:rgba(96,165,250,0.3)">${counts.low} Low</span>` : ''}
        ${result.findings.length === 0 ? '<span class="bdg" style="color:#4ade80;background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.3)">Clean ✓</span>' : ''}
      </div>
    </div>
  </div>
  <div class="stats">
    <div class="sc"><div class="sn" style="color:${scoreColor}">${sc}</div><div class="sk">Score</div></div>
    <div class="sc"><div class="sn" style="color:#f87171">${counts.critical}</div><div class="sk">Critical</div></div>
    <div class="sc"><div class="sn" style="color:#fb923c">${counts.high}</div><div class="sk">High</div></div>
    <div class="sc"><div class="sn" style="color:#e4e4e7">${result.findings.length}</div><div class="sk">Total</div></div>
  </div>
  <div class="stitle">Findings (${result.findings.length})</div>
  ${result.findings.length === 0
    ? '<div class="empty"><div style="font-size:48px;margin-bottom:16px">🛡️</div><div style="font-size:20px;font-weight:600;color:#4ade80;margin-bottom:8px">No vulnerabilities detected</div><div style="font-size:14px;color:#71717a">Your project passed all security checks.</div></div>'
    : findingsHtml}
  <div class="foot"><span>Generated by Archy Security Scanner · AI-powered</span><span>archy.dev</span></div>
</div></body></html>`;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({ isOpen, onClose, files, framework, model }) => {
  const [result, setResult] = useState<SecurityResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setResult(null);

    try {
      const pyFiles = files.filter(f => f.endsWith('.py')).slice(0, 50);
      const fileData: Array<{ path: string; content: string }> = [];

      for (const path of pyFiles) {
        try {
          const content = await getFileContent(path);
          if (content) fileData.push({ path, content });
        } catch {}
      }

      if (fileData.length === 0) {
        setError('No readable Python files found.');
        setScanning(false);
        return;
      }

      const res = await fetch(`${BACKEND_URL}/brain/security-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileData, framework, model: model || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Scan failed');
      }

      setResult(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
    setScanning(false);
  };

  const downloadReport = () => {
    if (!result) return;
    const scannedCount = files.filter(f => f.endsWith('.py')).length;
    const html = generateHtmlReport(result, framework || 'Python', scannedCount);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archy-security-${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const toggleExpand = (idx: number) => {
    const next = new Set(expandedIdx);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedIdx(next);
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const scoreLabel = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Critical';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl max-h-[82vh] rounded-xl border overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <Shield className="w-4.5 h-4.5" style={{ color: 'var(--color-accent)' }} />
            <span className="text-[14px] font-semibold">Security Analysis</span>
            {result && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,134,255,0.1)', color: 'var(--color-accent)', border: '1px solid rgba(124,134,255,0.2)' }}>
                AI-powered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <button
                onClick={downloadReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all hover:opacity-90"
                style={{ background: 'rgba(124,134,255,0.12)', color: 'var(--color-accent)', border: '1px solid rgba(124,134,255,0.2)' }}
                title="Download HTML Report"
              >
                <Download className="w-3.5 h-3.5" />
                Report
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!result && !scanning && !error && (
            <div className="text-center py-10 space-y-5">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'rgba(124,134,255,0.08)', border: '1px solid rgba(124,134,255,0.15)' }}>
                <ShieldCheck className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <p className="text-[15px] font-semibold mb-2">AI Security Scanner</p>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  Scans your Python files for exposed secrets, unsafe configurations,
                  injection vulnerabilities, and missing authentication. Uses AI to generate
                  an intelligent assessment.
                </p>
              </div>
              <button
                onClick={runScan}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90 hover:-translate-y-px"
                style={{ background: 'var(--color-accent)', color: 'white', boxShadow: '0 4px 16px rgba(124,134,255,0.3)' }}
              >
                <Shield className="w-4 h-4" />
                Run Security Scan
              </button>
              <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                {files.filter(f => f.endsWith('.py')).length} Python files to scan
              </p>
            </div>
          )}

          {scanning && (
            <div className="text-center py-14 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: 'var(--color-accent)' }} />
              <div>
                <p className="text-[13px] font-medium">Scanning for vulnerabilities...</p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>AI analysis in progress</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
              <p className="text-[13px] font-medium mb-1" style={{ color: '#f87171' }}>Scan failed</p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{error}</p>
              <button onClick={runScan} className="mt-3 flex items-center gap-1.5 text-[12px] transition-colors hover:opacity-80" style={{ color: 'var(--color-text-muted)' }}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {result && (
            <>
              <div className="flex items-start gap-5 p-5 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-hover)' }}>
                <div className="text-center shrink-0">
                  <div className={`text-[40px] font-bold font-mono leading-none ${scoreColor(result.score)}`}>
                    {result.score}
                  </div>
                  <div className={`text-[11px] font-medium mt-1 ${scoreColor(result.score)}`}>
                    {scoreLabel(result.score)}
                  </div>
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--color-text-faint)' }}>/ 100</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] leading-relaxed mb-3">{result.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    {['critical', 'high', 'medium', 'low'].map(sev => {
                      const count = result.findings.filter(f => f.severity === sev).length;
                      if (count === 0) return null;
                      const c = severityColors[sev];
                      return (
                        <span key={sev} className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>
                          {count} {sev}
                        </span>
                      );
                    })}
                    {result.findings.length === 0 && (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                        No issues ✓
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={runScan}
                  className="p-2 rounded-lg border transition-colors hover:bg-white/5 shrink-0"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                  title="Re-scan"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {result.findings.length > 0 && (
                <div className="space-y-2">
                  <div className="mono-label">FINDINGS ({result.findings.length})</div>
                  {result.findings.map((f, idx) => {
                    const colors = severityColors[f.severity] || severityColors.info;
                    const expanded = expandedIdx.has(idx);
                    return (
                      <div key={idx} className={`rounded-lg border overflow-hidden ${colors.border}`} style={{ background: 'var(--color-surface)' }}>
                        <button
                          onClick={() => toggleExpand(idx)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                        >
                          {severityIcons[f.severity]}
                          <div className="flex-1 min-w-0">
                            <span className="text-[12px] font-medium">{f.description}</span>
                          </div>
                          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} shrink-0`}>
                            {f.severity}
                          </span>
                          {expanded
                            ? <ChevronDown className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-faint)' }} />
                            : <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-faint)' }} />}
                        </button>
                        {expanded && (
                          <div className="px-3 pb-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center gap-2 mt-2.5 mb-2">
                              <FileCode className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-faint)' }} />
                              <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                {f.file}{f.line ? `:${f.line}` : ''}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-faint)' }}>
                                {f.category}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg text-[12px] leading-relaxed" style={{ background: 'rgba(124,134,255,0.05)', border: '1px solid rgba(124,134,255,0.1)', color: 'var(--color-text-muted)' }}>
                              <span style={{ color: 'var(--color-accent)' }}>💡</span> {f.suggestion}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
