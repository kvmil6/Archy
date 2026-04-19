/**
 * Part 3B — MCP Settings Panel.
 *
 * Shows MCP server status, config snippets for Claude Code / Cursor / Windsurf,
 * and a Test Connection button.
 */
import React, { useState } from 'react';
import { X, Copy, Check, Server, PlayCircle, Loader2 } from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';

interface MCPSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const MCP_CONFIGS: { editor: string; filename: string; config: object }[] = [
  {
    editor: 'Claude Code',
    filename: '.claude/settings.json',
    config: {
      mcpServers: {
        archy: {
          command: 'python',
          args: ['backend/mcp_server.py'],
        },
      },
    },
  },
  {
    editor: 'Cursor',
    filename: '.cursor/mcp.json',
    config: {
      mcpServers: {
        archy: {
          command: 'python',
          args: ['backend/mcp_server.py'],
        },
      },
    },
  },
  {
    editor: 'Windsurf',
    filename: '.windsurf/mcp.json',
    config: {
      mcpServers: {
        archy: {
          command: 'python',
          args: ['backend/mcp_server.py'],
        },
      },
    },
  },
];

export const MCPSettingsPanel: React.FC<MCPSettingsPanelProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyConfig = (editor: string, config: object) => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(editor);
    setTimeout(() => setCopied(null), 2000);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/status`);
      if (res.ok) {
        setTestResult('Backend is reachable. MCP server should work when started separately with: python backend/mcp_server.py');
      } else {
        setTestResult(`Backend returned status ${res.status}`);
      }
    } catch {
      setTestResult('Cannot reach backend. Make sure it is running.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Server className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">MCP Server</h3>
            <p className="text-[10px] text-white/50">Connect AI editors to your architecture</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* How to start */}
        <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Start MCP Server</div>
          <div className="font-mono text-[12px] text-white/80 bg-black/30 rounded-lg px-3 py-2">
            python backend/mcp_server.py
          </div>
          <p className="text-[10px] text-white/40">
            Runs as a stdio MCP server. It reads <code className="text-white/60">.archy_cache/graph.json</code> which is updated after every parse.
          </p>
        </div>

        {/* Editor configs */}
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Editor Configuration</div>
          {MCP_CONFIGS.map(({ editor, filename, config }) => (
            <div key={editor} className="bg-surface-800/40 rounded-xl border border-white/5 overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-medium text-white/80">{editor}</div>
                  <div className="text-[10px] font-mono text-white/40">{filename}</div>
                </div>
                <button
                  onClick={() => copyConfig(editor, config)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/5 hover:bg-white/10 transition-colors"
                  style={{ color: copied === editor ? '#4ade80' : 'var(--color-text-muted)' }}
                >
                  {copied === editor ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === editor ? 'Copied!' : 'Copy config'}
                </button>
              </div>
              <pre className="px-4 py-2 text-[10px] font-mono text-white/50 bg-black/20 border-t border-white/5 overflow-x-auto">
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        {/* Test connection */}
        <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Test Connection</div>
          <button
            onClick={testConnection}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50 transition-colors border border-blue-500/20"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Test backend connectivity
          </button>
          {testResult && (
            <div className="text-[11px] text-white/60 bg-black/20 rounded-lg px-3 py-2">
              {testResult}
            </div>
          )}
        </div>

        {/* Available tools */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Available Tools</div>
          {[
            { name: 'get_architecture_summary', desc: 'Project overview, health score, top complex files' },
            { name: 'list_models', desc: 'All model/schema nodes with fields' },
            { name: 'list_routes', desc: 'All route nodes with HTTP method and path' },
            { name: 'get_node_details', desc: 'Full node data by ID or fuzzy name' },
            { name: 'trace_data_flow', desc: 'Upstream/downstream flow chain' },
            { name: 'find_circular_dependencies', desc: 'All circular dependency pairs' },
            { name: 'get_file_content', desc: 'Source content by file path or node name' },
          ].map((tool) => (
            <div key={tool.name} className="flex items-start gap-2 px-1">
              <span className="text-[11px] font-mono text-blue-400/70 flex-shrink-0">{tool.name}</span>
              <span className="text-[10px] text-white/40">{tool.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
