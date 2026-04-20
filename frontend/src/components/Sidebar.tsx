import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useGraphStore } from '@/store/useGraphStore';
import { BACKEND_URL } from '@/services/apiClient';
import { 
  getFileContent, 
  getCurrentProjectPath,
  hasDirectoryHandle,
  restoreDirectoryHandle 
} from '@/services/fileSystem';
import { 
  GitBranch, 
  Plus, 
  Network, 
  Settings, 
  Database, 
  FileCode, 
  ExternalLink, 
  FolderOpen,
  Folder,
  Hash,
  Search,
  ChevronRight,
  ChevronDown,
  Filter,
  RefreshCw,
  AppWindow,
  Puzzle,
  Workflow,
  Boxes,
  Layers2,
  Box,
  DatabaseBackup,
  BookTemplate,
  X,
  Code,
  Monitor,
  Cpu,
  Terminal,
  CheckCircle2
} from 'lucide-react';

// Framework colour tokens used in Graph Stats badge
const FRAMEWORK_COLORS: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  fastapi:   { dot: '#22d3ee', text: '#67e8f9', bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.2)'  },
  django:    { dot: '#34d399', text: '#6ee7b7', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)'  },
  flask:     { dot: '#fb923c', text: '#fdba74', bg: 'rgba(251,146,60,0.08)',   border: 'rgba(251,146,60,0.2)'  },
  starlette: { dot: '#a78bfa', text: '#c4b5fd', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  express:   { dot: '#f9a8d4', text: '#fbcfe8', bg: 'rgba(249,168,212,0.08)', border: 'rgba(249,168,212,0.2)' },
  nextjs:    { dot: '#e2e8f0', text: '#f8fafc', bg: 'rgba(226,232,240,0.08)', border: 'rgba(226,232,240,0.2)' },
  nestjs:    { dot: '#f87171', text: '#fca5a5', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
  rails:     { dot: '#f87171', text: '#fca5a5', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
  spring:    { dot: '#4ade80', text: '#86efac', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.2)'  },
};

interface DraggableItem {
  type: string;
  label: string;
  icon: React.ElementType;
  description: string;
  accentColor: string;
  glowColor: string;
  bgClass: string;
  category: string;
}

const DRAGGABLE_NODES: DraggableItem[] = [
  // Entry Layer
  {
    type: 'app',
    label: 'App',
    icon: AppWindow,
    description: 'Application entry point',
    accentColor: '#ec4899',
    glowColor: 'rgba(236,72,153,0.2)',
    bgClass: 'bg-pink-500/10 border-pink-500/25 hover:border-pink-400/50',
    category: 'Entry',
  },
  {
    type: 'module',
    label: 'Module',
    icon: Puzzle,
    description: 'Cohesive group of classes',
    accentColor: '#10b981',
    glowColor: 'rgba(16,185,129,0.2)',
    bgClass: 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-400/50',
    category: 'Domain',
  },
  // Interface Layer
  {
    type: 'entryInterface',
    label: 'Entry Interface',
    icon: Workflow,
    description: 'Presentation layer (HTTP, CLI, gRPC)',
    accentColor: '#3b82f6',
    glowColor: 'rgba(59,130,246,0.2)',
    bgClass: 'bg-blue-500/10 border-blue-500/25 hover:border-blue-400/50',
    category: 'Interface',
  },
  {
    type: 'controller',
    label: 'Controller',
    icon: Network,
    description: 'Accepts requests, delegates to service',
    accentColor: '#6366f1',
    glowColor: 'rgba(99,102,241,0.2)',
    bgClass: 'bg-indigo-500/10 border-indigo-500/25 hover:border-indigo-400/50',
    category: 'Interface',
  },
  // Infrastructure Layer
  {
    type: 'diContainer',
    label: 'DI Container',
    icon: Boxes,
    description: 'Dependency injection container',
    accentColor: '#06b6d4',
    glowColor: 'rgba(6,182,212,0.2)',
    bgClass: 'bg-cyan-500/10 border-cyan-500/25 hover:border-cyan-400/50',
    category: 'Infrastructure',
  },
  {
    type: 'repoInterface',
    label: 'Repo Interface',
    icon: Layers2,
    description: 'Data access contract',
    accentColor: '#64748b',
    glowColor: 'rgba(100,116,139,0.2)',
    bgClass: 'bg-slate-500/10 border-slate-500/25 hover:border-slate-400/50',
    category: 'Infrastructure',
  },
  {
    type: 'repository',
    label: 'Repository',
    icon: DatabaseBackup,
    description: 'Implements data access interface',
    accentColor: '#f97316',
    glowColor: 'rgba(249,115,22,0.2)',
    bgClass: 'bg-orange-500/10 border-orange-500/25 hover:border-orange-400/50',
    category: 'Infrastructure',
  },
  // Domain Layer
  {
    type: 'domain',
    label: 'Domain',
    icon: Box,
    description: 'Core business domain',
    accentColor: '#f43f5e',
    glowColor: 'rgba(244,63,94,0.2)',
    bgClass: 'bg-rose-500/10 border-rose-500/25 hover:border-rose-400/50',
    category: 'Domain',
  },
  {
    type: 'service',
    label: 'Service',
    icon: Settings,
    description: 'Business logic layer',
    accentColor: '#60a5fa',
    glowColor: 'rgba(59,130,246,0.2)',
    bgClass: 'bg-blue-500/10 border-blue-500/25 hover:border-blue-400/50',
    category: 'Domain',
  },
  // Data Layer
  {
    type: 'model',
    label: 'DB Model',
    icon: Database,
    description: 'Database entity',
    accentColor: '#34d399',
    glowColor: 'rgba(52,211,153,0.2)',
    bgClass: 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-400/50',
    category: 'Data',
  },
  {
    type: 'schema',
    label: 'Schema / DTO',
    icon: BookTemplate,
    description: 'Data transfer object',
    accentColor: '#fbbf24',
    glowColor: 'rgba(251,191,36,0.2)',
    bgClass: 'bg-amber-500/10 border-amber-500/25 hover:border-amber-400/50',
    category: 'Data',
  },
];

// File type categorization for Django projects
const categorizeDjangoFile = (filepath: string): { type: string; icon: React.ElementType; color: string } => {
  const lower = filepath.toLowerCase();
  
  if (lower.includes('models')) return { type: 'Model', icon: Database, color: '#34d399' };
  if (lower.includes('views')) return { type: 'View', icon: Network, color: '#a78bfa' };
  if (lower.includes('urls')) return { type: 'URL Config', icon: Hash, color: '#f472b6' };
  if (lower.includes('serializers')) return { type: 'Serializer', icon: FileCode, color: '#60a5fa' };
  if (lower.includes('admin')) return { type: 'Admin', icon: Settings, color: '#fbbf24' };
  if (lower.includes('forms')) return { type: 'Form', icon: FileCode, color: '#a78bfa' };
  if (lower.includes('tests')) return { type: 'Test', icon: FileCode, color: '#f87171' };
  if (lower.includes('migrations')) return { type: 'Migration', icon: RefreshCw, color: '#94a3b8' };
  if (lower.includes('settings')) return { type: 'Settings', icon: Settings, color: '#fbbf24' };
  if (lower.includes('middleware')) return { type: 'Middleware', icon: Settings, color: '#60a5fa' };
  if (lower.includes('management')) return { type: 'Command', icon: FileCode, color: '#c084fc' };
  if (lower.includes('signals')) return { type: 'Signal', icon: FileCode, color: '#fb923c' };
  if (lower.includes('tasks')) return { type: 'Task', icon: FileCode, color: '#4ade80' };
  
  return { type: 'Module', icon: FileCode, color: '#60a5fa' };
};

/** Django/Alembic-style migration files — sorted last in the tree so config/settings stay visible first. */
function isMigrationLikeFile(fullPath: string, filename: string): boolean {
  const p = fullPath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/migrations/') && filename.toLowerCase().endsWith('.py')) {
    if (filename === '__init__.py') return false;
    return true;
  }
  const n = filename.toLowerCase();
  if (!n.endsWith('.py')) return false;
  if (/^0{2,}/.test(filename)) return true;
  if (/^\d{4}_/.test(filename)) return true;
  return false;
}

function shouldHideFromExplorer(fullPath: string): boolean {
  const normalized = fullPath.replace(/\\/g, '/').toLowerCase();
  const filename = normalized.split('/').pop() || '';

  if (normalized.startsWith('.claude/') || normalized.includes('/.claude/')) return true;
  if (filename.endsWith('.md')) return true;

  // Keep .env files visible so users can inspect environment config from the explorer.
  if (/\.(pem|key|p12|pfx)$/.test(filename)) return true;
  if (/(^|[._-])(secret|secrets|credential|credentials)([._-]|$)/.test(filename)) return true;

  const sensitiveNames = new Set([
    '.npmrc',
    '.pypirc',
    'id_rsa',
    'id_ed25519',
    'credentials.json',
    'credentials.yaml',
    'credentials.yml',
    'secrets.json',
    'secrets.yaml',
    'secrets.yml',
  ]);
  if (sensitiveNames.has(filename)) return true;

  return false;
}

interface SidebarProps {
  files?: string[];
  projectPath?: string;
  /** Called when a file is clicked in the tree. If provided, opens the FileDetailPanel instead of a new tab. */
  onFileSelect?: (filepath: string) => void;
  /** When true the sidebar panel is collapsed (width controlled by parent wrapper). */
  collapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ files = [], projectPath = '', onFileSelect, collapsed = false }) => {
  const { nodes, edges, framework } = useGraphStore();
  const [searchQuery, setSearchQuery] = useState('');
  // Auto-expand the root-level directories on first load
  const [expandedApps, setExpandedApps] = useState<Set<string>>(() => {
    // Will be populated on first render via effect
    return new Set<string>();
  });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showEditorDialog, setShowEditorDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [availableEditors, setAvailableEditors] = useState<Array<{command: string; name: string; description: string}>>([]);
  const [selectedEditor, setSelectedEditor] = useState<string>('code');
  const [rememberEditor, setRememberEditor] = useState(false);
  const detectedPath = projectPath;
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const editorOpenInFlightRef = useRef(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);

  const beginEditorOpen = () => {
    if (editorOpenInFlightRef.current) {
      return false;
    }
    editorOpenInFlightRef.current = true;
    setIsOpeningEditor(true);
    return true;
  };

  const endEditorOpen = () => {
    editorOpenInFlightRef.current = false;
    setIsOpeningEditor(false);
  };

  // Keep full project files internally, but hide sensitive/testing/docs files in explorer UI.
  const allFiles = useMemo(
    () => files.filter((f) => !shouldHideFromExplorer(f)).sort((a, b) => a.localeCompare(b)),
    [files],
  );
  const pythonFiles = useMemo(() => allFiles.filter(f => f.endsWith('.py')), [allFiles]);

  // Recursive tree structure
  type TreeNode = {
    name: string;
    path: string; // Full path for files; folder path for dirs
    isDir: boolean;
    children: TreeNode[];
  };

  const fileTree = useMemo<TreeNode>(() => {
    const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
    for (const filepath of allFiles) {
      const parts = filepath.split('/');
      let current = root;
      let soFar = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        soFar = soFar ? `${soFar}/${part}` : part;
        let next = current.children.find(c => c.name === part);
        if (!next) {
          next = {
            name: part,
            path: isLast ? filepath : soFar,
            isDir: !isLast,
            children: [],
          };
          current.children.push(next);
        }
        current = next;
      }
    }
    // Sort: directories first; `migrations` folders and migration-like files last (so settings, urls, etc. surface first)
    const sortNode = (n: TreeNode) => {
      n.children.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        const aLow = a.name.toLowerCase();
        const bLow = b.name.toLowerCase();
        const aMig = a.isDir ? (aLow === 'migrations' ? 1 : 0) : (isMigrationLikeFile(a.path, a.name) ? 1 : 0);
        const bMig = b.isDir ? (bLow === 'migrations' ? 1 : 0) : (isMigrationLikeFile(b.path, b.name) ? 1 : 0);
        if (aMig !== bMig) return aMig - bMig;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sortNode);
    };
    sortNode(root);
    return root;
  }, [allFiles]);

  // Filter tree by search query (keeps matching files + their parent dirs)
  const filteredTree = useMemo<TreeNode>(() => {
    if (!searchQuery.trim()) return fileTree;
    const q = searchQuery.toLowerCase();
    const prune = (node: TreeNode): TreeNode | null => {
      if (!node.isDir) {
        return node.path.toLowerCase().includes(q) ? node : null;
      }
      const kids = node.children.map(prune).filter((c): c is TreeNode => c !== null);
      if (kids.length === 0) return null;
      return { ...node, children: kids };
    };
    return prune(fileTree) || { ...fileTree, children: [] };
  }, [fileTree, searchQuery]);

  // Detect available editors on mount
  useEffect(() => {
    detectEditors();
    // Load saved editor preference
    const saved = localStorage.getItem('archy_preferred_editor');
    if (saved) {
      setSelectedEditor(saved);
      setRememberEditor(true);
    }
  }, []);

  // Auto-expand root-level directories when files are first loaded
  useEffect(() => {
    if (fileTree.children.length > 0) {
      const rootDirs = fileTree.children
        .filter(c => c.isDir)
        .map(c => c.path);
      setExpandedApps(prev => {
        if (prev.size > 0) return prev; // Don't override manual expansions
        return new Set(rootDirs);
      });
    }
  }, [fileTree]);

  const detectEditors = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/editor/detect`);
      if (response.ok) {
        const data = await response.json();
        setAvailableEditors(data.available_editors || []);
        if (data.available_editors?.length > 0) {
          setSelectedEditor(data.available_editors[0].command);
        }
      }
    } catch {
      // Fallback to common editors
      setAvailableEditors([
        { command: 'code', name: 'VS Code', description: 'Microsoft VS Code' },
        { command: 'cursor', name: 'Cursor', description: 'AI-first code editor' },
        { command: 'windsurf', name: 'Windsurf', description: 'AI-powered IDE' },
      ]);
    }
  };

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleApp = (app: string) => {
    setExpandedApps(prev => {
      const next = new Set(prev);
      if (next.has(app)) {
        next.delete(app);
      } else {
        next.add(app);
      }
      return next;
    });
  };

  const openFile = useCallback(async (filepath: string) => {
    setSelectedFile(filepath);
    setPendingFile(filepath);
    
    // Primary path: delegate to the parent (opens FileDetailPanel)
    if (onFileSelect) {
      onFileSelect(filepath);
      return;
    }

    // No parent handler: always show editor selection dialog — never auto-open
    setShowEditorDialog(true);
  }, [onFileSelect]);

  const openWithEditor = async (filepath: string, editorCmd: string) => {
    if (!beginEditorOpen()) {
      return;
    }

    const effectivePath = detectedPath || projectPath;

    try {
      const response = await fetch(`${BACKEND_URL}/editor/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath,
          project_root: effectivePath || undefined,
          editor: editorCmd,
        }),
      });
      if (response.ok) {
        setEditorMessage(`Opened ${filepath.split('/').pop()} in ${editorCmd}.`);
        setShowEditorDialog(false);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.detail || `HTTP ${response.status}`);
    } catch (err) {
      setEditorMessage((err as Error).message || 'Could not open file in editor.');
      setShowEditorDialog(false);
    } finally {
      endEditorOpen();
    }
  };

  const handleEditorSelect = () => {
    if (pendingFile && selectedEditor) {
      if (rememberEditor) {
        localStorage.setItem('archy_preferred_editor', selectedEditor);
      } else {
        localStorage.removeItem('archy_preferred_editor');
      }
      openWithEditor(pendingFile, selectedEditor);
    }
  };

  const openProjectInEditor = async (editorCmd?: string) => {
    if (!beginEditorOpen()) {
      return;
    }

    const effectivePath = detectedPath || projectPath;
    if (!effectivePath) {
      endEditorOpen();
      return;
    }

    const cmd = editorCmd || selectedEditor || 'code';
    try {
      const response = await fetch(`${BACKEND_URL}/editor/open-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: effectivePath, editor: cmd }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.detail || `HTTP ${response.status}`);
      }
      const editorNames: Record<string, string> = { code: 'VS Code', cursor: 'Cursor', windsurf: 'Windsurf', subl: 'Sublime Text', zed: 'Zed' };
      setEditorMessage(`Opened in ${editorNames[cmd] ?? cmd}.`);
    } catch (err) {
      setEditorMessage((err as Error).message || 'Could not open project in editor.');
    } finally {
      endEditorOpen();
    }
  };

  const totalFiles = allFiles.length;
  const totalPythonFiles = pythonFiles.length;
  const rootFolders = fileTree.children.filter(c => c.isDir).length;

  return (
    <aside
      className="flex h-full w-full flex-col overflow-hidden"
      style={{
        background: 'var(--color-bg-subtle)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mono-label mb-1">EXPLORER</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold">{projectPath.split(/[\\/]/).pop() || 'Project'}</div>
            <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              <span className="numeric">{totalFiles}</span> files ·{' '}
              <span className="numeric">{totalPythonFiles}</span> .py ·{' '}
              <span className="numeric">{rootFolders}</span> folders
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            placeholder="Filter Python files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
          />
        </div>
      </div>

      {/* Node palette - Grouped by Category (compact so the file tree stays prominent) */}
      <div className="max-h-52 shrink-0 space-y-3 overflow-y-auto border-b border-white/5 p-3 custom-scrollbar">
        {['Entry', 'Interface', 'Domain', 'Infrastructure', 'Data'].map((category) => {
          const categoryNodes = DRAGGABLE_NODES.filter(n => n.category === category);
          if (categoryNodes.length === 0) return null;
          
          return (
            <div key={category}>
              <div className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
                {category} Layer
              </div>
              <div className="space-y-1">
                {categoryNodes.map((item) => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, item.type)}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-move ${item.bgClass}`}
                    style={{ transition: 'all 0.2s' }}
                    title={item.description}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                         style={{ background: `rgba(255,255,255,0.08)`, color: item.accentColor }}>
                      <item.icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-white/80 leading-none">{item.label}</div>
                    </div>
                    <Plus size={8} className="text-white/20 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* File Tree Explorer - Scrollable */}
      {allFiles.length > 0 ? (
        <div className="min-h-[220px] flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-2 pb-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="mono-label">PROJECT TREE</div>
              <button 
                type="button"
                onClick={() => openProjectInEditor('code')}
                disabled={isOpeningEditor}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-90 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: 'var(--color-accent)' }}
                title="Open this project folder with VS Code"
              >
                <FolderOpen size={10} />
                {isOpeningEditor ? 'Opening...' : 'Open with VS Code'}
              </button>
            </div>

            {editorMessage && (
              <div className="mb-2 rounded-md px-2 py-1 text-[10px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {editorMessage}
              </div>
            )}
            
            {filteredTree.children.length > 0 ? (
              <FileTree
                nodes={filteredTree.children}
                depth={0}
                expanded={expandedApps}
                onToggle={toggleApp}
                selectedFile={selectedFile}
                onFileClick={openFile}
                autoExpandAll={!!searchQuery.trim()}
              />
            ) : (
              <div className="text-center py-8">
                <Filter size={16} className="text-white/20 mx-auto mb-1" />
                <p className="text-[10px] text-white/40">No files match "{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <Filter size={24} className="text-white/10 mb-2" />
          <p className="text-[11px] text-white/40 text-center">No files scanned</p>
        </div>
      )}

      {/* Graph stats */}
      <div className="p-3 border-t overflow-y-auto custom-scrollbar" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Graph Stats</div>
            {framework && framework !== 'unknown' ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{
                background: FRAMEWORK_COLORS[framework]?.bg ?? 'rgba(255,255,255,0.06)',
                border: `1px solid ${FRAMEWORK_COLORS[framework]?.border ?? 'rgba(255,255,255,0.12)'}`,
              }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{
                  background: FRAMEWORK_COLORS[framework]?.dot ?? '#94a3b8',
                  boxShadow: `0 0 5px ${FRAMEWORK_COLORS[framework]?.dot ?? '#94a3b8'}`,
                }} />
                <span className="text-[9px] font-semibold capitalize" style={{ color: FRAMEWORK_COLORS[framework]?.text ?? '#94a3b8' }}>
                  {framework}
                </span>
              </div>
            ) : (
              <span className="text-[9px] text-white/20">unknown</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatPill label="Nodes" value={nodes.length} color="#a78bfa" />
            <StatPill label="Edges" value={edges.length} color="#60a5fa" />
            <StatPill label="Files" value={totalFiles} color="#34d399" />
            <StatPill label="Python" value={totalPythonFiles} color="#fbbf24" />
          </div>
        </div>
      </div>

      {/* Instruction footer */}
      <div className="px-4 pb-4 pt-2 text-[10px] text-white/20 leading-relaxed shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span>Click file opens the side panel here (not VS Code)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span>Drag components to canvas</span>
        </div>
      </div>

      {/* Editor Selection Dialog */}
      {showEditorDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 rounded-xl border border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">Choose Editor</h3>
              <button
                onClick={() => setShowEditorDialog(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-4">
              <p className="text-xs text-white/60">
                Select which editor to open <code className="bg-white/10 px-1 rounded">{pendingFile?.split('/').pop()}</code> in:
              </p>
              
              {/* Editor Options */}
              <div className="space-y-2">
                {availableEditors.map((editor) => (
                  <button
                    key={editor.command}
                    onClick={() => setSelectedEditor(editor.command)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      selectedEditor === editor.command
                        ? 'bg-blue-500/20 border-blue-500/40'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      {editor.command === 'code' ? <Code className="w-4 h-4 text-blue-400" /> :
                       editor.command === 'cursor' ? <Cpu className="w-4 h-4 text-purple-400" /> :
                       editor.command === 'windsurf' ? <Monitor className="w-4 h-4 text-cyan-400" /> :
                       <Terminal className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-white">{editor.name}</div>
                      <div className="text-[10px] text-white/40">{editor.description}</div>
                    </div>
                    {selectedEditor === editor.command && (
                      <div className="ml-auto w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              
              {/* Remember Preference */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberEditor}
                  onChange={(e) => setRememberEditor(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 checked:bg-blue-500 checked:border-blue-500"
                />
                <span className="text-xs text-white/60">Remember my choice</span>
              </label>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-white/10">
              <button
                onClick={() => setShowEditorDialog(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white/60 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditorSelect}
                disabled={isOpeningEditor || !pendingFile || !selectedEditor}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isOpeningEditor ? 'Opening...' : 'Open File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

const StatPill = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
    <div className="text-sm font-bold" style={{ color }}>{value}</div>
    <div className="text-[9px] text-white/25">{label}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// File Tree rendering
// ─────────────────────────────────────────────────────────────────────

type FileTreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
};

interface FileTreeProps {
  nodes: FileTreeNode[];
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selectedFile: string | null;
  onFileClick: (path: string) => void;
  autoExpandAll?: boolean;
}

const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  depth,
  expanded,
  onToggle,
  selectedFile,
  onFileClick,
  autoExpandAll = false,
}) => {
  return (
    <div className={depth === 0 ? '' : 'ml-3 border-l border-white/5 pl-0.5'}>
      {nodes.map((node) => {
        if (node.isDir) {
          const isOpen = autoExpandAll || expanded.has(node.path);
          const fileCount = countFiles(node);
          return (
            <div key={node.path}>
              <button
                onClick={() => onToggle(node.path)}
                className="w-full flex items-center gap-1 px-1.5 py-1 rounded hover:bg-white/5 transition-colors text-left group"
              >
                {isOpen ? (
                  <ChevronDown size={11} className="text-white/30 flex-shrink-0" />
                ) : (
                  <ChevronRight size={11} className="text-white/30 flex-shrink-0" />
                )}
                <FolderIcon name={node.name} open={isOpen} />
                <span className="text-[11px] text-white/75 group-hover:text-white truncate">
                  {node.name}
                </span>
                <span className="ml-auto text-[9px] font-mono text-white/25 flex-shrink-0">
                  {fileCount}
                </span>
              </button>
              {isOpen && node.children.length > 0 && (
                <FileTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  autoExpandAll={autoExpandAll}
                />
              )}
            </div>
          );
        }

        const meta = getFileMeta(node.name, node.path);
        const isSelected = selectedFile === node.path;
        return (
          <button
            key={node.path}
            onClick={() => onFileClick(node.path)}
            className={`w-full flex items-center gap-1.5 pl-5 pr-1.5 py-1 rounded transition-colors text-left group ${
              isSelected ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-white/5'
            }`}
            title={node.path}
          >
            <meta.Icon size={11} style={{ color: meta.color }} className="flex-shrink-0" />
            <span
              className={`text-[11px] truncate flex-1 ${
                isSelected ? 'text-[var(--color-text)]' : 'text-white/65 group-hover:text-white'
              }`}
            >
              {node.name}
            </span>
            {meta.badge && (
              <span
                className="text-[8px] font-mono font-bold uppercase px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                style={{ background: meta.color + '20', color: meta.color }}
              >
                {meta.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

function countFiles(node: FileTreeNode): number {
  if (!node.isDir) return 1;
  return node.children.reduce((sum, c) => sum + countFiles(c), 0);
}

/**
 * Smart folder icon — special colors for Django app-level folders
 */
const FolderIcon: React.FC<{ name: string; open: boolean }> = ({ name, open }) => {
  const lower = name.toLowerCase();
  let color = '#fbbf24'; // default yellow
  if (lower === 'migrations') color = '#64748b';
  else if (lower === 'tests' || lower === '__tests__') color = '#4ade80';
  else if (lower === 'templates') color = '#a78bfa';
  else if (lower === 'static') color = '#60a5fa';
  else if (lower === 'management' || lower === 'commands') color = '#f97316';

  return open ? (
    <FolderOpen size={12} style={{ color }} className="flex-shrink-0" />
  ) : (
    <Folder size={12} style={{ color }} className="flex-shrink-0" />
  );
};

/**
 * Smart file icon + badge based on filename conventions
 */
function getFileMeta(filename: string, fullPath: string): {
  Icon: React.ElementType;
  color: string;
  badge?: string;
} {
  const lower = filename.toLowerCase();
  const pathLower = fullPath.toLowerCase();

  // Django-specific files
  const djangoFiles: Record<string, { color: string; badge?: string }> = {
    'models.py':      { color: '#4ade80', badge: 'MODEL' },
    'views.py':       { color: '#60a5fa', badge: 'VIEW' },
    'urls.py':        { color: '#a78bfa', badge: 'URL' },
    'admin.py':       { color: '#f97316', badge: 'ADMIN' },
    'serializers.py': { color: '#22d3ee', badge: 'DRF' },
    'forms.py':       { color: '#ec4899', badge: 'FORM' },
    'tests.py':       { color: '#4ade80', badge: 'TEST' },
    'settings.py':    { color: '#fbbf24', badge: 'CONF' },
    'apps.py':        { color: '#10b981', badge: 'APP' },
    'signals.py':     { color: '#f43f5e', badge: 'SIG' },
    'tasks.py':       { color: '#06b6d4', badge: 'TASK' },
    'middleware.py':  { color: '#8b5cf6', badge: 'MW' },
    'permissions.py': { color: '#f59e0b', badge: 'PERM' },
    'managers.py':    { color: '#34d399', badge: 'MGR' },
    'wsgi.py':        { color: '#94a3b8', badge: 'WSGI' },
    'asgi.py':        { color: '#94a3b8', badge: 'ASGI' },
    'manage.py':      { color: '#a78bfa', badge: 'CLI' },
    'main.py':        { color: '#a78bfa', badge: 'ENTRY' },
    '__init__.py':    { color: '#64748b' },
  };
  if (djangoFiles[lower]) {
    return { Icon: FileCode, ...djangoFiles[lower] };
  }

  // Migrations (path-based or Django numbering / 00-prefixed migration-style names)
  if (pathLower.includes('/migrations/') && lower.endsWith('.py')) {
    if (lower === '__init__.py') return { Icon: FileCode, color: '#64748b' };
    return { Icon: FileCode, color: '#64748b', badge: 'MIG' };
  }
  if (lower.endsWith('.py') && (/^0{2,}/.test(filename) || /^\d{4}_/.test(filename))) {
    return { Icon: FileCode, color: '#64748b', badge: 'MIG' };
  }

  // Generic Python
  if (lower.endsWith('.py')) {
    return { Icon: FileCode, color: '#3b82f6' };
  }

  // By extension
  const byExt: Record<string, { color: string; badge?: string }> = {
    '.md':         { color: '#94a3b8', badge: 'DOC' },
    '.json':       { color: '#fbbf24' },
    '.yaml':       { color: '#ef4444' },
    '.yml':        { color: '#ef4444' },
    '.toml':       { color: '#9ca3af' },
    '.ini':        { color: '#9ca3af' },
    '.cfg':        { color: '#9ca3af' },
    '.env':        { color: '#4ade80', badge: 'ENV' },
    '.txt':        { color: '#94a3b8' },
    '.sql':        { color: '#22d3ee', badge: 'SQL' },
    '.sh':         { color: '#4ade80' },
    '.ps1':        { color: '#60a5fa' },
    '.dockerfile': { color: '#2563eb', badge: 'DOCK' },
    '.gitignore':  { color: '#f97316', badge: 'GIT' },
    '.js':         { color: '#fbbf24' },
    '.ts':         { color: '#3b82f6' },
    '.tsx':        { color: '#3b82f6' },
    '.jsx':        { color: '#fbbf24' },
    '.css':        { color: '#ec4899' },
    '.scss':       { color: '#ec4899' },
  };
  for (const ext in byExt) {
    if (lower.endsWith(ext)) {
      return { Icon: FileCode, ...byExt[ext] };
    }
  }

  // Special filenames (no extension or exact name match)
  const special: Record<string, { color: string; badge?: string }> = {
    'dockerfile':       { color: '#2563eb', badge: 'DOCK' },
    'makefile':         { color: '#94a3b8' },
    'readme':           { color: '#94a3b8', badge: 'DOC' },
    'license':          { color: '#94a3b8' },
    'requirements.txt': { color: '#fbbf24', badge: 'DEPS' },
    'pyproject.toml':   { color: '#fbbf24', badge: 'DEPS' },
    'pipfile':          { color: '#fbbf24', badge: 'DEPS' },
    'package.json':     { color: '#fbbf24', badge: 'DEPS' },
    '.env':             { color: '#4ade80', badge: 'ENV' },
    '.env.local':       { color: '#4ade80', badge: 'ENV' },
    '.env.example':     { color: '#86efac', badge: 'ENV' },
    '.env.development': { color: '#4ade80', badge: 'ENV' },
    '.env.production':  { color: '#f87171', badge: 'ENV' },
    '.env.staging':     { color: '#fbbf24', badge: 'ENV' },
    '.gitignore':       { color: '#f97316', badge: 'GIT' },
    '.dockerignore':    { color: '#60a5fa', badge: 'DOCK' },
  };
  if (special[lower]) {
    return { Icon: FileCode, ...special[lower] };
  }

  return { Icon: FileCode, color: '#64748b' };
}