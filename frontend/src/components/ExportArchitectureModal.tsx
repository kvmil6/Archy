import React, { useState, useMemo } from 'react';
import { X, Copy, Check, Code, FileText, Lightbulb, TestTube, Wand2, Download } from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';

interface ExportArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
  files?: string[];
  insights?: {
    architecture_smells: Array<{ type: string; location: string; suggestion: string }>;
    circular_dependencies: string[][];
    high_complexity_files: Array<{ path: string; complexity: number; suggestion: string }>;
    orphan_files: string[];
  } | null;
  metrics?: {
    total_files: number;
    total_classes: number;
    total_functions: number;
    total_lines: number;
    total_models: number;
    total_routes: number;
    average_complexity: number;
  } | null;
}

type FeatureKey = 'generate' | 'explain' | 'suggest' | 'tests';

const FEATURES: { key: FeatureKey; label: string; icon: React.ReactNode; description: string }[] = [
  {
    key: 'generate',
    label: 'Generate code',
    icon: <Code className="w-4 h-4" />,
    description: 'Generate production-ready code that implements this architecture',
  },
  {
    key: 'explain',
    label: 'Explain layers',
    icon: <FileText className="w-4 h-4" />,
    description: 'Explain the purpose and responsibilities of each layer',
  },
  {
    key: 'suggest',
    label: 'Suggest improvements',
    icon: <Lightbulb className="w-4 h-4" />,
    description: 'Identify potential issues and suggest architectural improvements',
  },
  {
    key: 'tests',
    label: 'Add tests',
    icon: <TestTube className="w-4 h-4" />,
    description: 'Generate comprehensive test coverage for the architecture',
  },
];

export const ExportArchitectureModal: React.FC<ExportArchitectureModalProps> = ({ isOpen, onClose, files = [], insights = null, metrics = null }) => {
  const { nodes, edges, framework } = useGraphStore();
  const [selectedFeatures, setSelectedFeatures] = useState<Set<FeatureKey>>(new Set(['generate']));
  const [copied, setCopied] = useState(false);

  const toggleFeature = (key: FeatureKey) => {
    setSelectedFeatures(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Generate architecture prompt
  const architecturePrompt = useMemo(() => {
    // Build component list
    const components = nodes.map(node => ({
      id: node.id,
      type: node.type,
      name: node.data?.label || 'Unnamed',
      description: node.data?.description || '',
    }));

    // Build relationship list
    const relationships = edges.map(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      return {
        from: source?.data?.label || edge.source,
        to: target?.data?.label || edge.target,
        fromType: source?.type || 'unknown',
        toType: target?.type || 'unknown',
      };
    });

    // Group by type for better organization
    const groupedByType = components.reduce((acc, comp) => {
      const type = comp.type || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(comp);
      return acc;
    }, {} as Record<string, typeof components>);

    // Build the prompt
    let prompt = '';
    
    // Architecture overview
    prompt += `---\n`;
    prompt += `Architecture Overview:\n\n`;
    prompt += `Framework: ${framework.toUpperCase()}\n`;
    prompt += `Total Components: ${components.length}\n`;
    prompt += `Total Relationships: ${relationships.length}\n\n`;

    // Components by layer
    prompt += `---\n`;
    prompt += `Components by Layer:\n\n`;
    
    const typeLabels: Record<string, string> = {
      app: 'Entry Layer',
      module: 'Domain Layer',
      entryInterface: 'Interface Layer',
      controller: 'Interface Layer',
      diContainer: 'Infrastructure Layer',
      repoInterface: 'Infrastructure Layer',
      repository: 'Infrastructure Layer',
      domain: 'Domain Layer',
      service: 'Domain Layer',
      model: 'Data Layer',
      schema: 'Data Layer',
      route: 'API Layer',
      utility: 'Utility Layer',
    };

    Object.entries(groupedByType).forEach(([type, comps]) => {
      const label = typeLabels[type] || type;
      prompt += `${label}:\n`;
      comps.forEach(comp => {
        prompt += `  - ${comp.name}${comp.description ? ` (${comp.description})` : ''}\n`;
      });
      prompt += `\n`;
    });

    // Relationships
    if (relationships.length > 0) {
      prompt += `---\n`;
      prompt += `Component Relationships (Data Flow):\n\n`;
      relationships.forEach(rel => {
        prompt += `  - ${rel.from} → ${rel.to}\n`;
      });
      prompt += `\n`;
    }

    // Project file tree (condensed)
    if (files.length > 0) {
      prompt += `---\n`;
      prompt += `Project File Tree (${files.length} files):\n\n`;
      // Build condensed tree from file paths
      const dirs = new Map<string, string[]>();
      for (const f of files) {
        const parts = f.split('/');
        const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
        const file = parts[parts.length - 1];
        if (!dirs.has(dir)) dirs.set(dir, []);
        dirs.get(dir)!.push(file);
      }
      for (const [dir, dirFiles] of dirs) {
        prompt += `  ${dir}/\n`;
        for (const file of dirFiles.slice(0, 10)) {
          prompt += `    ${file}\n`;
        }
        if (dirFiles.length > 10) {
          prompt += `    ... +${dirFiles.length - 10} more\n`;
        }
      }
      prompt += `\n`;
    }

    // Analysis results
    if (metrics) {
      prompt += `---\n`;
      prompt += `Analysis Results:\n\n`;
      prompt += `  Files: ${metrics.total_files}, Classes: ${metrics.total_classes}, Functions: ${metrics.total_functions}\n`;
      prompt += `  Lines: ${metrics.total_lines}, Models: ${metrics.total_models}, Routes: ${metrics.total_routes}\n`;
      prompt += `  Avg Complexity: ${metrics.average_complexity}\n\n`;
    }

    if (insights) {
      if (insights.architecture_smells.length > 0) {
        prompt += `Architecture Issues:\n`;
        for (const smell of insights.architecture_smells) {
          prompt += `  ⚠ ${smell.type} at ${smell.location}: ${smell.suggestion}\n`;
        }
        prompt += `\n`;
      }
      if (insights.circular_dependencies.length > 0) {
        prompt += `Circular Dependencies:\n`;
        for (const cycle of insights.circular_dependencies) {
          prompt += `  ↻ ${cycle.join(' → ')}\n`;
        }
        prompt += `\n`;
      }
      if (insights.high_complexity_files.length > 0) {
        prompt += `Complexity Hotspots:\n`;
        for (const f of insights.high_complexity_files) {
          prompt += `  🔥 ${f.path} (cx ${f.complexity}): ${f.suggestion}\n`;
        }
        prompt += `\n`;
      }
    }

    // Instructions based on selected features
    prompt += `---\n`;
    prompt += `[Instructions:\n\n`;

    if (selectedFeatures.has('generate')) {
      prompt += `Generate production-ready code that implements this architecture. `;
      prompt += `Use the same layer and component names. `;
      prompt += `Follow ${framework} best practices and patterns. `;
      prompt += `Include proper dependency injection and separation of concerns.\n\n`;
    }

    if (selectedFeatures.has('explain')) {
      prompt += `Explain the purpose and responsibilities of each layer in this architecture. `;
      prompt += `Describe how data flows through the system. `;
      prompt += `Clarify the relationships between components.\n\n`;
    }

    if (selectedFeatures.has('suggest')) {
      prompt += `Review this architecture and suggest improvements. `;
      prompt += `Identify potential bottlenecks or design issues. `;
      prompt += `Recommend patterns that would improve maintainability. `;
      prompt += `Point out any missing pieces in the architecture.\n\n`;
    }

    if (selectedFeatures.has('tests')) {
      prompt += `Generate comprehensive test coverage for this architecture. `;
      prompt += `Include unit tests for individual components. `;
      prompt += `Add integration tests for the relationships. `;
      prompt += `Cover edge cases and error scenarios.\n\n`;
    }

    prompt += `]`;

    return prompt;
  }, [nodes, edges, framework, selectedFeatures, files, insights, metrics]);

  const handleCopy = () => {
    navigator.clipboard.writeText(architecturePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Export Architecture</h2>
              <p className="text-xs text-white/50">Use as a prompt for AI code generation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Feature Toggles */}
          <div className="space-y-3">
            <p className="text-sm text-white/70">
              Toggle badges to add or remove instructions for the AI:
            </p>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map((feature) => {
                const isSelected = selectedFeatures.has(feature.key);
                return (
                  <button
                    key={feature.key}
                    onClick={() => toggleFeature(feature.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                    }`}
                    title={feature.description}
                  >
                    {feature.icon}
                    {feature.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">Generated Prompt</span>
              <span className="text-xs text-white/40">
                {architecturePrompt.length} characters
              </span>
            </div>
            <div className="relative">
              <pre className="w-full h-64 bg-black/40 rounded-xl p-4 text-sm font-mono text-slate-300 overflow-auto custom-scrollbar border border-white/5">
                {architecturePrompt}
              </pre>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => {
                const blob = new Blob([architecturePrompt], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'archy-architecture.md';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 transition-all"
            >
              <Download className="w-4 h-4" />
              .md
            </button>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy to clipboard
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium bg-white text-slate-900 hover:bg-white/90 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
