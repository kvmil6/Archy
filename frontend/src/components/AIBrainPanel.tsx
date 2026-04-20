import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Brain, 
  X, 
  Activity, 
  FileCode, 
  GitBranch, 
  Layers, 
  Zap,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Share2,
  AlertCircle,
  Settings,
  Info,
  Send,
  MessageSquare
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useGraphStore } from '@/store/useGraphStore';
import { useAIStore } from '@/store/useAIStore';
import { getFileContent } from '@/services/fileSystem';
import { BACKEND_URL } from '@/services/apiClient';

interface FileAnalysis {
  path: string;
  file_type: string;
  language: string;
  purpose: string;
  functions: string[];
  imports: string[];
  line_count: number;
  complexity_score: number;
  relationships: Array<{
    target: string;
    type: string;
    strength: number;
  }>;
}

interface ProjectMetrics {
  total_files: number;
  total_lines: number;
  average_complexity: number;
  language_distribution: Record<string, number>;
  type_distribution: Record<string, number>;
}

interface BrainData {
  analyses: Record<string, FileAnalysis>;
  relationship_graph: Record<string, string[]>;
  metrics: ProjectMetrics;
  framework?: string;
  project_name?: string;
}

interface AIBrainPanelProps {
  isOpen: boolean;
  onClose: () => void;
  files?: string[];
}

const LineGraph: React.FC<{ data: BrainData | null }> = ({ data }) => {
  if (!data) return null;

  const { analyses, relationship_graph, metrics } = data;
  const analysisEntries = Object.entries(analyses);
  
  const width = 280;
  const height = 200;
  const padding = 20;
  
  const points = analysisEntries.map(([, analysis], index) => {
    const x = padding + (index / Math.max(1, analysisEntries.length - 1)) * (width - 2 * padding);
    const y = height - padding - (analysis.complexity_score / 10) * (height - 2 * padding);
    return { x, y, analysis };
  });

  const pathData = points.length > 0 
    ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
    : '';

  const areaPath = points.length > 0
    ? `${pathData} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`
    : '';

  return (
    <div className="space-y-4">
      {/* Main Line Graph */}
      <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-white/70 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            Complexity Analysis
          </span>
          <span className="text-[10px] text-white/40">Complexity Score vs Files</span>
        </div>
        
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
          {/* Grid lines */}
          {[0, 2, 4, 6, 8, 10].map(score => {
            const y = height - padding - (score / 10) * (height - 2 * padding);
            return (
              <line
                key={score}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="4,4"
              />
            );
          })}
          
          {/* Filled area under line */}
          <path
            d={areaPath}
            fill="url(#areaGradient)"
            opacity={0.3}
          />
          
          {/* Main line */}
          <path
            d={pathData}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {points.map((point, i) => (
            <g key={i}>
              <circle
                cx={point.x}
                cy={point.y}
                r={4}
                fill="#9333ea"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth={1.5}
              />
              <title>{`${point.analysis.path.split('/').pop()}: Complexity ${point.analysis.complexity_score}/10`}</title>
            </g>
          ))}
          
          {/* Gradients */}
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9333ea" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#9333ea" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#9333ea" stopOpacity={0.1} />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Legend */}
        <div className="flex items-center justify-between mt-2 text-[10px] text-white/40">
          <span>Low Complexity</span>
          <div className="flex items-center gap-1">
            <div className="w-8 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
          </div>
          <span>High Complexity</span>
        </div>
      </div>

      {/* Relationship Web */}
      <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-white/70 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-blue-400" />
            File Relationships
          </span>
          <span className="text-[10px] text-white/40">
            {Object.keys(relationship_graph).filter(k => relationship_graph[k].length > 0).length} connected files
          </span>
        </div>
        
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {Object.entries(relationship_graph)
            .filter(([, targets]) => targets.length > 0)
            .slice(0, 5)
            .map(([source, targets]) => (
              <div key={source} className="flex items-start gap-2 text-[10px]">
                <div className="flex-1 min-w-0">
                  <span className="text-purple-300 truncate block">
                    {source.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center text-white/30">
                  <ChevronRight className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-blue-300 truncate block">
                    {targets[0].split('/').pop()}
                    {targets.length > 1 && ` +${targets.length - 1}`}
                  </span>
                </div>
              </div>
            ))}
          {Object.values(relationship_graph).every(t => t.length === 0) && (
            <p className="text-[10px] text-white/30 italic">No relationships detected</p>
          )}
        </div>
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-800/50 rounded-lg p-2 border border-white/5 text-center">
          <div className="text-lg font-bold text-purple-400">{metrics.total_files}</div>
          <div className="text-[9px] text-white/50">Files</div>
        </div>
        <div className="bg-surface-800/50 rounded-lg p-2 border border-white/5 text-center">
          <div className="text-lg font-bold text-pink-400">{metrics.total_lines.toLocaleString()}</div>
          <div className="text-[9px] text-white/50">Lines</div>
        </div>
        <div className="bg-surface-800/50 rounded-lg p-2 border border-white/5 text-center">
          <div className="text-lg font-bold text-blue-400">{metrics.average_complexity}</div>
          <div className="text-[9px] text-white/50">Avg Complexity</div>
        </div>
      </div>

      {/* Language Distribution */}
      <div className="bg-surface-800/50 rounded-xl p-4 border border-white/5">
        <div className="flex items-center gap-1.5 mb-3">
          <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-white/70">Language Distribution</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(metrics.language_distribution).map(([lang, count]) => (
            <span 
              key={lang}
              className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-white/60 border border-white/10"
            >
              {lang}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const FileDetailCard: React.FC<{ 
  file: FileAnalysis; 
  isExpanded: boolean; 
  onToggle: () => void;
}> = ({ file, isExpanded, onToggle }) => {
  const getFileIcon = (type: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      python: <span className="text-yellow-400">py</span>,
      javascript: <span className="text-yellow-300">js</span>,
      typescript: <span className="text-blue-400">ts</span>,
      react: <span className="text-cyan-400">jsx</span>,
      'react-ts': <span className="text-blue-500">tsx</span>,
      json: <span className="text-gray-400">{}</span>,
      stylesheet: <span className="text-pink-400">css</span>,
      markup: <span className="text-orange-400">html</span>,
      vector: <span className="text-green-400">svg</span>,
      image: <span className="text-purple-400">img</span>,
    };
    return iconMap[type] || <FileCode className="w-3 h-3 text-gray-400" />;
  };

  return (
    <div className="bg-surface-800/40 rounded-lg border border-white/5 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-white/5 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-white/40" />
        )}
        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold">
          {getFileIcon(file.file_type)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">
            {file.path.split('/').pop()}
          </p>
          <p className="text-[10px] text-white/40 truncate">
            {file.language} • {file.line_count} lines
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div 
            className={`w-2 h-2 rounded-full ${
              file.complexity_score > 7 ? 'bg-red-400' :
              file.complexity_score > 4 ? 'bg-yellow-400' :
              'bg-green-400'
            }`}
            title={`Complexity: ${file.complexity_score}/10`}
          />
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5">
          <p className="text-[11px] text-white/70 mb-2 leading-relaxed">
            {file.purpose}
          </p>
          
          {file.functions.length > 0 && (
            <div className="mb-2">
              <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Functions</p>
              <div className="flex flex-wrap gap-1">
                {file.functions.slice(0, 5).map((fn, i) => (
                  <span 
                    key={i}
                    className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/20"
                  >
                    {fn}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {file.imports.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Imports</p>
              <div className="flex flex-wrap gap-1">
                {file.imports.slice(0, 5).map((imp, i) => (
                  <span 
                    key={i}
                    className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/20"
                  >
                    {imp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Session token usage footer — shows total tokens across all models */
const SessionTokenFooter: React.FC = () => {
  const tokenUsage = useAIStore((s) => s.tokenUsage);
  const entries = Object.values(tokenUsage);
  const tokens = entries.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
  const models = entries.length;
  if (tokens === 0) return null;
  return (
    <div className="border-t border-white/5 px-4 py-1.5 flex items-center gap-2">
      <Activity className="w-3 h-3 text-purple-400" />
      <span className="text-[10px] text-white/40">
        Session: <span className="text-white/60 font-mono">{tokens.toLocaleString()}</span> tokens used across{' '}
        <span className="text-white/60 font-mono">{models}</span> model{models !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

export const AIBrainPanel: React.FC<AIBrainPanelProps> = ({ isOpen, onClose, files = [] }) => {
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [apiStatus, setApiStatus] = useState<{ available: boolean; message: string } | null>(null);
  const [apiChecking, setApiChecking] = useState(false);
  const [useLocalAnalysis, setUseLocalAnalysis] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { nodes } = useGraphStore();
  const selectedModelId = useAIStore((s) => s.selectedModelId);

  useEffect(() => {
    if (isOpen) {
      checkApiStatus();
    }
  }, [isOpen]);

  const checkApiStatus = async () => {
    setApiChecking(true);
    try {
      const response = await fetch(`${BACKEND_URL}/status/ai`);
      if (response.ok) {
        const data = await response.json();
        setApiStatus({
          available: data.ai_available,
          message: data.message
        });
        if (!data.ai_available) {
          setUseLocalAnalysis(true);
        }
      } else {
        setApiStatus({ available: false, message: 'Backend error checking AI status.' });
        setUseLocalAnalysis(true);
      }
    } catch {
      setApiStatus({
        available: false,
        message: 'Cannot connect to backend. Make sure the server is running on port 8000.'
      });
      setUseLocalAnalysis(true);
    } finally {
      setApiChecking(false);
    }
  };

  const performLocalAnalysis = () => {
    const analyses: Record<string, FileAnalysis> = {};
    
    files.forEach((path) => {
      const filename = path.split('/').pop() || path;
      const isModel = path.includes('models');
      const isView = path.includes('views');
      const isUrl = path.includes('urls');
      const isSerializer = path.includes('serializer');
      const isAdmin = path.includes('admin');
      
      let purpose = 'Python module';
      if (isModel) purpose = 'Database model definition';
      else if (isView) purpose = 'View logic and request handling';
      else if (isUrl) purpose = 'URL routing configuration';
      else if (isSerializer) purpose = 'Data serialization/deserialization';
      else if (isAdmin) purpose = 'Admin interface configuration';
      
      analyses[path] = {
        path,
        file_type: 'python',
        language: 'Python',
        purpose,
        functions: [],
        imports: [],
        line_count: Math.floor(Math.random() * 100) + 20,
        complexity_score: isModel ? 6 : isView ? 5 : 3,
        relationships: [],
      };
    });
    
    setBrainData({
      analyses,
      relationship_graph: {},
      metrics: {
        total_files: files.length,
        total_lines: files.length * 50,
        average_complexity: 4,
        language_distribution: { Python: files.length },
        type_distribution: { python: files.length },
      },
    });
  };

  const analyzeFiles = useCallback(async () => {
    if (files.length === 0) return;
    
    if (useLocalAnalysis || !apiStatus?.available) {
      setIsLoading(true);
      setTimeout(() => {
        performLocalAnalysis();
        setIsLoading(false);
      }, 500);
      return;
    }
    
    setIsLoading(true);
    try {
      const pythonFiles = files.filter(p => p.endsWith('.py')).slice(0, 20);
      const BATCH = 5;
      const fileContents: Array<{ path: string; content: string }> = [];
      for (let i = 0; i < pythonFiles.length; i += BATCH) {
        const batch = pythonFiles.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (path) => {
            try {
              const content = await getFileContent(path);
              return content ? { path, content } : null;
            } catch {
              return null;
            }
          })
        );
        for (const r of results) {
          if (r) fileContents.push(r);
        }
      }

      if (fileContents.length === 0) {
        performLocalAnalysis();
        return;
      }

      const brainResponse = await fetch(`${BACKEND_URL}/brain/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          files: fileContents,
          project_name: 'current-project',
          model: selectedModelId || undefined,
        }),
      });

      if (brainResponse.ok) {
        const brainDataResult = await brainResponse.json();
        setBrainData(brainDataResult);
        return;
      }

      const parseResponse = await fetch(`${BACKEND_URL}/parser/analyze-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileContents }),
      });

      if (parseResponse.ok) {
        const data = await parseResponse.json();
        const analyses: Record<string, FileAnalysis> = {};
        for (const node of (data.nodes || [])) {
          const path = node.data?.filepath || node.id;
          analyses[path] = {
            path,
            file_type: 'python',
            language: 'Python',
            purpose: node.data?.description || `${node.data?.category || 'module'} — ${node.data?.methodCount ?? 0} methods`,
            functions: node.data?.methods || [],
            imports: [],
            line_count: 0,
            complexity_score: node.data?.complexity || 3,
            relationships: [],
          };
        }
        const m = data.metrics || {};
        setBrainData({
          analyses,
          relationship_graph: {},
          metrics: {
            total_files: m.total_files || fileContents.length,
            total_lines: m.total_lines || 0,
            average_complexity: m.average_complexity || 0,
            language_distribution: { Python: m.total_files || fileContents.length },
            type_distribution: { python: m.total_files || fileContents.length },
          },
        });
        return;
      }

      performLocalAnalysis();
    } catch (error) {
      console.error('Brain analysis failed:', error);
      performLocalAnalysis();
    } finally {
      setIsLoading(false);
    }
  }, [files, useLocalAnalysis, apiStatus, selectedModelId]);

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  useEffect(() => {
    if (isOpen && !brainData && !isLoading) {
      analyzeFiles();
    }
  }, [isOpen, brainData, isLoading, analyzeFiles]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-surface-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Brain</h3>
            <p className="text-[10px] text-white/50">Smart File Analysis</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* API Status Banner */}
        {apiStatus && !apiStatus.available && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-300">AI API Not Configured</p>
                <p className="text-[10px] text-white/50 mt-1">
                  Using local analysis (limited). For full AI features:
                </p>
                <ol className="text-[10px] text-white/40 mt-1.5 space-y-1 list-decimal list-inside">
                  <li>Get API key from <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">openrouter.ai</a></li>
                  <li>Add to <code className="bg-white/10 px-1 rounded">backend/.env</code>:
                    <br/><code className="text-emerald-400">OPENROUTER_API_KEY=sk-or-v1-...</code>
                  </li>
                  <li>Restart backend server</li>
                </ol>
                <button
                  onClick={() => setUseLocalAnalysis(true)}
                  className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 underline"
                >
                  Continue with local analysis →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Using Local Analysis Notice */}
        {useLocalAnalysis && apiStatus?.available && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-blue-300">Using Local Analysis</p>
                <p className="text-[10px] text-white/50 mt-1">
                  AI is available but running in local mode. Click "Re-analyze" to use AI.
                </p>
                <button
                  onClick={() => {
                    setUseLocalAnalysis(false);
                    analyzeFiles();
                  }}
                  className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 underline"
                >
                  Switch to AI analysis →
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
            <p className="text-xs text-white/60">Analyzing project architecture...</p>
            <p className="text-[10px] text-white/30">Processing files and building intelligence...</p>
          </div>
        ) : brainData ? (
          <>
            {/* Line Graph Visualizations */}
            <LineGraph data={brainData} />

            {/* Smart Descriptions */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-white/70">Smart Descriptions</span>
              </div>
              <div className="space-y-2">
                {Object.values(brainData.analyses).slice(0, 5).map((file) => (
                  <FileDetailCard
                    key={file.path}
                    file={file}
                    isExpanded={expandedFiles.has(file.path)}
                    onToggle={() => toggleFile(file.path)}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Zap className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-xs text-white/40">No files to analyze</p>
          </div>
        )}
      </div>

      {/* AI Chat Section — shown while checking or when AI is available */}
      {(apiChecking || apiStatus?.available) && !useLocalAnalysis && (
        <div className="border-t border-white/10 flex flex-col" style={{ maxHeight: '260px' }}>
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5">
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-medium text-white/70">Ask AI about your project</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 custom-scrollbar" style={{ minHeight: '60px', maxHeight: '160px' }}>
            {chatMessages.length === 0 && (
              <p className="text-[10px] text-white/30 text-center py-3">Ask anything about your architecture...</p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`text-[11px] leading-relaxed px-2.5 py-1.5 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-purple-500/15 text-purple-200 ml-6 border border-purple-500/20'
                  : 'bg-white/5 text-white/70 mr-6 border border-white/5'
              }`}>
                {msg.text}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/15">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] text-purple-300/70">Analyzing project...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="px-3 pb-3 pt-1">
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!chatInput.trim() || chatLoading) return;
              const question = chatInput.trim();
              setChatInput('');
              setChatMessages(prev => [...prev, { role: 'user', text: question }]);
              setChatLoading(true);
              try {
                const KEY_FILE_PATTERNS = [
                  /^(main|app|server|manage|wsgi|asgi|settings|config|urls)\.(py|ts|js)$/i,
                  /requirements\.txt$/i,
                  /package\.json$/i,
                  /pyproject\.toml$/i,
                  /README\.md$/i,
                ];
                const keyFiles = files
                  .filter(f => {
                    const base = f.split('/').pop() || '';
                    return KEY_FILE_PATTERNS.some(re => re.test(base));
                  })
                  .slice(0, 8);

                const sampledFiles = [
                  ...keyFiles,
                  ...files.filter(f => f.endsWith('.py') && !keyFiles.includes(f)).slice(0, 7),
                ].slice(0, 15);

                const fileContents: Array<{ path: string; snippet: string }> = [];
                for (const path of sampledFiles) {
                  try {
                    const content = await getFileContent(path);
                    if (content) {
                      fileContents.push({ path, snippet: content.slice(0, 1500) });
                    }
                  } catch { /* skip */ }
                }

                const context = {
                  files: files,
                  file_contents: fileContents,
                  metrics: brainData?.metrics ?? null,
                  graph: brainData?.relationship_graph ?? null,
                  framework: brainData?.framework || 'Python',
                  project_name: brainData?.project_name || '',
                  analyses: brainData ? Object.fromEntries(
                    Object.entries(brainData.analyses).slice(0, 20).map(([k, v]) => [k, {
                      purpose: v.purpose,
                      functions: v.functions.slice(0, 8),
                      complexity_score: v.complexity_score,
                    }])
                  ) : {},
                };
                const res = await fetch(`${BACKEND_URL}/brain/chat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    question,
                    context,
                    model: selectedModelId || undefined,
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setChatError(null);
                  setChatMessages(prev => [...prev, { role: 'ai', text: data.answer || data.response || 'No response received.' }]);
                } else {
                  const errData = await res.json().catch(() => ({}));
                  const detail = errData.detail || '';
                  let friendlyMsg = 'Something went wrong. Please try again.';
                  if (res.status === 400) friendlyMsg = 'API key not configured. Add your OpenRouter key in the settings.';
                  else if (res.status === 401 || res.status === 403) friendlyMsg = 'OpenRouter rejected the API key. Check backend/.env and try again.';
                  else if (res.status === 402) friendlyMsg = 'OpenRouter billing issue (Payment Required). Add credits or switch to a free model.';
                  else if (res.status === 504 || res.status === 408) friendlyMsg = 'The AI took too long to respond. Try a shorter question.';
                  else if (res.status === 502) friendlyMsg = detail || 'AI service is temporarily unavailable. Try again in a moment.';
                  else if (res.status === 429) friendlyMsg = 'Rate limit reached. Wait a moment before sending another message.';
                  setChatError(friendlyMsg);
                  setChatMessages(prev => [...prev, { role: 'ai', text: friendlyMsg }]);
                }
              } catch {
                const msg = 'Cannot connect to backend. Make sure the server is running on port 8000.';
                setChatError(msg);
                setChatMessages(prev => [...prev, { role: 'ai', text: msg }]);
              }
              setChatLoading(false);
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            }} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about architecture..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white/80 placeholder-white/30 focus:outline-none focus:border-purple-500/40"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-30 transition-colors border border-purple-500/20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Token Usage Session Total */}
      <SessionTokenFooter />

      {/* Footer */}
      <div className="h-12 border-t border-white/10 flex items-center justify-between px-4 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">
            {brainData ? `${brainData.metrics.total_files} files analyzed` : 'Ready'}
          </span>
          {useLocalAnalysis && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/20">
              Local
            </span>
          )}
          {!useLocalAnalysis && apiStatus?.available && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">
              AI
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={analyzeFiles}
          disabled={isLoading || files.length === 0}
          className="text-[10px]"
        >
          <GitBranch className="w-3 h-3 mr-1" />
          Re-analyze
        </Button>
      </div>
    </div>
  );
};
