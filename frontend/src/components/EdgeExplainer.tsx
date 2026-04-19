/**
 * Feature 3 — AI Edge Explanation popover.
 *
 * Click an edge → AI explains why these two nodes are connected,
 * what data flows between them, and the decoupling impact.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { X, Loader2, GitBranch, Zap } from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { getFileContent } from '@/services/fileSystem';

interface EdgeExplainerProps {
  edge: { source: string; target: string } | null;
  nodes: any[];
  position: { x: number; y: number } | null;
  onClose: () => void;
  model?: string;
}

export const EdgeExplainer: React.FC<EdgeExplainerProps> = ({
  edge,
  nodes,
  position,
  onClose,
  model,
}) => {
  const [explanation, setExplanation] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const explain = useCallback(async () => {
    if (!edge) return;
    setLoading(true);
    setExplanation('');

    const srcNode = nodes.find((n: any) => n.id === edge.source);
    const tgtNode = nodes.find((n: any) => n.id === edge.target);
    if (!srcNode || !tgtNode) {
      setExplanation('Could not find source or target node.');
      setLoading(false);
      return;
    }

    const srcLabel = srcNode.data?.label || edge.source;
    const tgtLabel = tgtNode.data?.label || edge.target;
    const srcType = srcNode.type || srcNode.data?.type || 'module';
    const tgtType = tgtNode.type || tgtNode.data?.type || 'module';

    // Try to get file contents for context
    let srcSnippet = '';
    let tgtSnippet = '';
    try {
      if (srcNode.data?.filepath) {
        const c = await getFileContent(srcNode.data.filepath);
        if (c) srcSnippet = c.slice(0, 1500);
      }
    } catch { /* skip */ }
    try {
      if (tgtNode.data?.filepath) {
        const c = await getFileContent(tgtNode.data.filepath);
        if (c) tgtSnippet = c.slice(0, 1500);
      }
    } catch { /* skip */ }

    const prompt = `You are an architecture expert. Explain this dependency edge in a Python backend:

Source: "${srcLabel}" (type: ${srcType})
Target: "${tgtLabel}" (type: ${tgtType})

${srcSnippet ? `Source code snippet:\n\`\`\`python\n${srcSnippet}\n\`\`\`\n` : ''}
${tgtSnippet ? `Target code snippet:\n\`\`\`python\n${tgtSnippet}\n\`\`\`\n` : ''}

Answer in 3-4 concise sentences:
1. WHY these modules are connected (what import/call creates this edge)
2. WHAT data flows between them
3. What would BREAK if you decoupled them

Be specific. Use actual class/function names from the code.`;

    try {
      const res = await fetch(`${BACKEND_URL}/brain/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: prompt,
          context: {
            files: [],
            file_contents: {},
            metrics: null,
            graph: null,
            framework: 'Python',
            project_name: '',
            analyses: {},
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExplanation(data.answer || data.response || 'No explanation available.');
      } else {
        // Fallback to local explanation
        setExplanation(
          `**${srcLabel}** (${srcType}) → **${tgtLabel}** (${tgtType})\n\n` +
          `This edge indicates that ${srcLabel} imports or depends on ${tgtLabel}. ` +
          `The source module likely uses classes, functions, or constants defined in the target. ` +
          `Decoupling would require introducing an interface or moving shared code to a separate module.`
        );
      }
    } catch {
      setExplanation(
        `**${srcLabel}** → **${tgtLabel}**\n\n` +
        `Static dependency edge. ${srcLabel} imports from ${tgtLabel}. ` +
        `Enable AI (set an API key) for detailed explanations.`
      );
    }
    setLoading(false);
  }, [edge, nodes, model]);

  useEffect(() => {
    if (edge) explain();
  }, [edge]);

  if (!edge || !position) return null;

  // Clamp position to viewport
  const x = Math.min(position.x, window.innerWidth - 360);
  const y = Math.min(position.y, window.innerHeight - 250);

  return (
    <div
      className="fixed z-[200] w-[340px] rounded-xl border shadow-2xl overflow-hidden"
      style={{
        left: x,
        top: y,
        background: '#12121a',
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[11px] font-semibold text-white/80">Edge Explanation</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X className="w-3 h-3 text-white/40" />
        </button>
      </div>

      {/* Edge label */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <span className="text-[10px] font-mono text-indigo-300 truncate">
          {nodes.find((n: any) => n.id === edge.source)?.data?.label || edge.source}
        </span>
        <span className="text-[10px] text-white/20">→</span>
        <span className="text-[10px] font-mono text-emerald-300 truncate">
          {nodes.find((n: any) => n.id === edge.target)?.data?.label || edge.target}
        </span>
      </div>

      <div className="px-3 py-3 max-h-[200px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span className="text-[11px] text-white/30">Analyzing connection...</span>
          </div>
        ) : (
          <div className="text-[11px] text-white/60 leading-relaxed whitespace-pre-wrap">
            {explanation}
          </div>
        )}
      </div>
    </div>
  );
};
