import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowUpRight, 
    FolderSearch, 
    Zap, 
    Code2,
    Sparkles,
    Cpu,
    Github,
    GitBranch,
    Gauge,
    AlertTriangle,
    Activity,
    Check,
    X,
    ChevronRight,
    Loader2,
    Wifi,
    WifiOff,
    AlertCircle,
    ShieldCheck,
    RefreshCw,
    Layers,
    Database,
    Trash2,
    Edit3,
    FolderOpen,
    Clock,
    Plus,
} from 'lucide-react';
import { storeDirectoryHandle, storeElectronFolderPath, storeTauriProjectPath, isElectron, isTauri } from '@/services/fileSystem';
import { ModelSelector } from '@/components/ModelSelector';
import { Logo } from '@/components/Logo';
import { detectFrameworkSmart } from '@/services/frameworkDetector';
import { useToast } from '@/components/Toast';
import { pingBackend, BACKEND_URL } from '@/services/apiClient';
import { listProjects, deleteProject, renameProject, type SavedProject } from '@/services/projectManager';

type ApiStatusType = {
    checked: boolean;
    available: boolean;
    message: string;
    keySource?: string | null;
};

type SaveState =
    | { phase: 'idle' }
    | { phase: 'saving' }
    | { phase: 'validating'; elapsedMs: number }
    | {
          phase: 'online';
          latencyMs?: number;
          credits?: number | null;
          tier?: string | null;
      }
    | { phase: 'error'; kind: 'invalid' | 'network_error' | 'rate_limited'; message: string };

export default function HomePage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [selectedModel, setSelectedModel] = useState('anthropic/claude-3.5-sonnet');
    const [projectPath, setProjectPath] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [saveState, setSaveState] = useState<SaveState>({ phase: 'idle' });
    const [apiStatus, setApiStatus] = useState<ApiStatusType>({
        checked: false,
        available: false,
        message: 'Checking...'
    });
    const [recentProjects, setRecentProjects] = useState<SavedProject[]>([]);
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const openProjectInFlightRef = useRef(false);

    // Initial check + poll every 5s so user sees .env changes immediately
    useEffect(() => {
        checkApiStatus();
        listProjects().then(p => setRecentProjects(p.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));

        // One-time backend reachability check — shows a clear warning if the
        // FastAPI server isn't running so the user knows what's wrong
        pingBackend(3000).then((result) => {
            if (!result.online) {
                toast.warning(
                    'Backend not reachable',
                    `Start it with: python backend/dev_server.py (port 8000)`,
                );
            }
        });

        const interval = setInterval(checkApiStatus, 5000);
        // Also re-check when window regains focus (user may have edited .env externally)
        const onFocus = () => checkApiStatus();
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const checkApiStatus = async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/status/ai`);
            if (response.ok) {
                const data = await response.json();
                setApiStatus({
                    checked: true,
                    available: data.ai_available,
                    message: data.message,
                    keySource: data.key_source,
                });
            } else {
                setApiStatus({ checked: true, available: false, message: 'Backend error' });
            }
        } catch {
            setApiStatus({ checked: true, available: false, message: 'Backend offline' });
        }
    };

    const saveApiKey = async () => {
        const key = apiKeyInput.trim();
        if (!key) return;

        // Quick client-side format check
        if (!key.startsWith('sk-or')) {
            setSaveState({
                phase: 'error',
                kind: 'invalid',
                message: "Invalid key format — OpenRouter keys start with 'sk-or-'",
            });
            return;
        }

        setSaveState({ phase: 'saving' });

        // Short delay then transition to validating (with an elapsed-ms ticker)
        const startedAt = Date.now();
        const tickHandle = window.setInterval(() => {
            setSaveState((prev) =>
                prev.phase === 'validating'
                    ? { phase: 'validating', elapsedMs: Date.now() - startedAt }
                    : prev
            );
        }, 100);
        setSaveState({ phase: 'validating', elapsedMs: 0 });

        try {
            const response = await fetch(`${BACKEND_URL}/config/api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ openrouter_api_key: key }),
            });

            if (!response.ok) {
                let detail = `HTTP ${response.status}`;
                try {
                    const err = await response.json();
                    detail = err.detail || detail;
                } catch {
                    /* ignore */
                }
                setSaveState({ phase: 'error', kind: 'network_error', message: detail });
                return;
            }

            const result = await response.json();
            const v = result.validation;

            if (v.valid) {
                setApiKeyInput('');
                setSaveState({
                    phase: 'online',
                    latencyMs: v.latency_ms,
                    credits: v.credits_remaining,
                    tier: v.account_tier,
                });
                toast.success(
                    'OpenRouter connected',
                    `Online · ${v.latency_ms ?? '?'}ms${v.credits_remaining != null ? ` · $${v.credits_remaining.toFixed(2)} credits` : ''}`,
                );
                // Refresh the nav status immediately
                await checkApiStatus();
                // Auto-reset to idle after 6s so the input returns to normal
                window.setTimeout(() => {
                    setSaveState((prev) => (prev.phase === 'online' ? { phase: 'idle' } : prev));
                }, 6000);
            } else {
                setSaveState({
                    phase: 'error',
                    kind: (v.status === 'invalid' || v.status === 'rate_limited' || v.status === 'network_error')
                        ? v.status
                        : 'network_error',
                    message: v.message || 'Validation failed',
                });
                toast.error(
                    v.status === 'invalid' ? 'Invalid API key' : v.status === 'rate_limited' ? 'Rate limited' : 'Connection failed',
                    v.message || 'OpenRouter rejected the request',
                );
                // Still refresh nav in case save wrote the key anyway
                await checkApiStatus();
            }
        } catch (err) {
            setSaveState({
                phase: 'error',
                kind: 'network_error',
                message: `Cannot reach backend: ${(err as Error).message}`,
            });
            toast.error('Backend unreachable', `Check the FastAPI server is running on :8000`);
        } finally {
            window.clearInterval(tickHandle);
        }
    };

    // Re-validate the currently-saved key (used for the "Test connection" button)
    const testConnection = async () => {
        setSaveState({ phase: 'validating', elapsedMs: 0 });
        try {
            const response = await fetch(`${BACKEND_URL}/config/validate-api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const v = await response.json();
            if (v.valid) {
                setSaveState({
                    phase: 'online',
                    latencyMs: v.latency_ms,
                    credits: v.credits_remaining,
                    tier: v.account_tier,
                });
                await checkApiStatus();
                window.setTimeout(() => {
                    setSaveState((prev) => (prev.phase === 'online' ? { phase: 'idle' } : prev));
                }, 5000);
            } else {
                setSaveState({
                    phase: 'error',
                    kind: (v.status === 'invalid' || v.status === 'rate_limited') ? v.status : 'network_error',
                    message: v.message || 'Validation failed',
                });
            }
        } catch (err) {
            setSaveState({
                phase: 'error',
                kind: 'network_error',
                message: `Backend unreachable: ${(err as Error).message}`,
            });
        }
    };

    // Framework detection now lives in @/services/frameworkDetector which reads
    // key files' contents for evidence-based scoring. See handleOpenProject below.

    const handleOpenProject = useCallback(async () => {
        if (openProjectInFlightRef.current) return;
        openProjectInFlightRef.current = true;
        setIsScanning(true);
        try {
            let scannedFiles: string[] = [];
            let projectName = '';
            let finalProjectPath = '';

            // Shared filter logic for directory scanning
            const IGNORE_DIRS = new Set([
                'node_modules', '__pycache__', '.git', '.svn', '.hg',
                'venv', '.venv', 'env', '.env.d', 'virtualenv', 'site-packages',
                'dist', 'build', '.next', '.nuxt', '.cache', '.turbo',
                '.idea', '.vscode', '.vs', '.fleet', '.windsurf',
                'coverage', 'htmlcov', '.coverage', '.pytest_cache', '.mypy_cache',
                '.ruff_cache', '.tox', 'target', 'out', 'tmp', 'temp',
                'staticfiles', 'static_collected', 'media', 'uploads',
            ]);

            const IGNORE_EXT = /\.(pyc|pyo|pyd|so|dll|dylib|exe|bin|class|jar|war|o|obj|lib|a|sqlite3?|db|log|lock|map|min\.js|min\.css|zip|tar|gz|7z|rar|jpg|jpeg|png|gif|bmp|webp|ico|svg|pdf|mp4|mp3|wav|ogg|ttf|woff2?|eot)$/i;

            const IGNORE_FILES = new Set([
                '.DS_Store', 'Thumbs.db', 'desktop.ini',
                'package-lock.json', 'yarn.lock', 'poetry.lock',
                'Pipfile.lock', 'uv.lock',
            ]);

            const shouldIncludeFile = (filename: string): boolean => {
                if (IGNORE_FILES.has(filename)) return false;
                if (IGNORE_EXT.test(filename)) return false;
                if (/\.html?$/i.test(filename)) return false;
                return true;
            };

            const ALLOWED_DOTFILES = new Set([
                '.gitignore', '.dockerignore', '.editorconfig',
                '.env', '.env.example', '.env.local', '.env.development',
                '.env.production', '.env.staging', '.env.test',
            ]);

            if (isTauri()) {
                // Tauri: use native dialog + fs plugin
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { readDir } = await import('@tauri-apps/plugin-fs');

                const selected = await open({
                    directory: true,
                    multiple: false,
                    title: 'Select your Python project folder',
                });

                if (!selected || typeof selected !== 'string') return;

                const folderPath = selected;
                projectName = folderPath.split(/[\\/]/).pop() || folderPath;
                finalProjectPath = folderPath;
                storeTauriProjectPath(folderPath);

                // Recursive scan via Tauri fs plugin
                const scanTauriDir = async (dirPath: string, prefix: string): Promise<string[]> => {
                    const entries = await readDir(dirPath);
                    const files: string[] = [];
                    for (const entry of entries) {
                        if (IGNORE_DIRS.has(entry.name)) continue;
                        if (entry.name.startsWith('.') && entry.name !== '.env.example') {
                            if (entry.isDirectory) continue;
                            if (!ALLOWED_DOTFILES.has(entry.name)) continue;
                        }
                        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                        if (entry.isFile) {
                            if (shouldIncludeFile(entry.name)) files.push(fullPath);
                        } else if (entry.isDirectory) {
                            const subFiles = await scanTauriDir(`${dirPath}/${entry.name}`, fullPath);
                            files.push(...subFiles);
                        }
                    }
                    return files;
                };

                scannedFiles = await scanTauriDir(folderPath, '');

            } else if (isElectron()) {
                const folderPath = await window.electronAPI!.openFolder();
                if (!folderPath) return;
                projectName = folderPath.split(/[\\/]/).pop() || folderPath;
                finalProjectPath = folderPath;
                storeElectronFolderPath(folderPath);
                scannedFiles = await window.electronAPI!.scanDirectory(folderPath);
            } else {
                // Browser: File System Access API
                // @ts-ignore
                const dirHandle = await window.showDirectoryPicker();
                projectName = dirHandle.name;

                const scanDirectory = async (handle: any, currentPath = '', files: string[] = []) => {
                    for await (const entry of handle.values()) {
                        if (IGNORE_DIRS.has(entry.name)) continue;
                        if (entry.name.startsWith('.') && entry.name !== '.env.example') {
                            if (entry.kind === 'directory') continue;
                            if (!ALLOWED_DOTFILES.has(entry.name)) continue;
                        }
                        const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                        if (entry.kind === 'file') {
                            if (shouldIncludeFile(entry.name)) files.push(fullPath);
                        } else if (entry.kind === 'directory') {
                            await scanDirectory(entry, fullPath, files);
                        }
                    }
                    return files;
                };

                scannedFiles = await scanDirectory(dirHandle);
                finalProjectPath = projectPath.trim() || projectName;
                storeDirectoryHandle(dirHandle, finalProjectPath);
            }

            // Smart detection — reads requirements.txt, package.json, main.py etc.
            const detection = await detectFrameworkSmart(scannedFiles);

            if (detection.framework !== 'unknown') {
                toast.info(
                    `Detected ${detection.framework}`,
                    `${Math.round(detection.confidence * 100)}% confidence · ${scannedFiles.length} files`,
                );
            } else {
                toast.warning('Framework not detected', `Parsed ${scannedFiles.length} files but no matching signals`);
            }

            navigate('/canvas', {
                state: {
                    projectName,
                    files: scannedFiles,
                    projectPath: finalProjectPath,
                    framework: detection.framework,
                    frameworkConfidence: detection.confidence,
                    frameworkSignals: detection.signals,
                    model: selectedModel,
                }
            });
        } catch (err) {
            const error = err as Error;
            if (error.name !== 'AbortError') {
                console.error("Directory picking failed", err);
                toast.error('Could not open project', error.message);
            }
        } finally {
            openProjectInFlightRef.current = false;
            setIsScanning(false);
        }
    }, [projectPath, selectedModel, navigate, toast]);

    const handleTryDemo = useCallback(async (name: string) => {
        setIsScanning(true);
        try {
            const res = await fetch(`${BACKEND_URL}/projects/examples/${name}/files`);
            if (!res.ok) throw new Error('Could not load demo project');
            const data = await res.json();
            const files: string[] = data.files.map((f: any) => f.path);

            const detection = await detectFrameworkSmart(files);
            navigate('/canvas', {
                state: {
                    projectName: data.name,
                    files,
                    projectPath: data.path,
                    framework: detection.framework,
                    frameworkConfidence: detection.confidence,
                    frameworkSignals: detection.signals,
                    model: selectedModel,
                },
            });
        } catch (err) {
            toast.error('Demo failed', (err as Error).message);
        } finally {
            setIsScanning(false);
        }
    }, [selectedModel, navigate, toast]);

    // Keyboard shortcut: Cmd/Ctrl+O to open project
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
                e.preventDefault();
                handleOpenProject();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleOpenProject]);

    const reloadProjects = useCallback(() => {
        listProjects().then(p => setRecentProjects(p.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
    }, []);

    const handleRenameProject = async (id: string) => {
        if (!editingName.trim()) return;
        await renameProject(id, editingName.trim());
        setEditingProjectId(null);
        setEditingName('');
        reloadProjects();
    };

    const handleDeleteProject = async (id: string) => {
        await deleteProject(id);
        setConfirmDeleteId(null);
        reloadProjects();
    };

    const openSavedProject = (p: SavedProject) => {
        navigate('/canvas', {
            state: {
                files: p.files || [],
                projectName: p.name,
                projectPath: p.projectPath || '',
                framework: p.framework || 'unknown',
                model: p.model || selectedModel,
                projectId: p.id,
                restoredNodes: p.nodes,
                restoredEdges: p.edges,
                restoredInsights: p.insights,
                restoredMetrics: p.metrics,
            },
        });
    };

    const formatRelativeTime = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 60_000) return 'just now';
        if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
        if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
        if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
        return new Date(iso).toLocaleDateString();
    };

    return (
        <div className="min-h-screen dot-grid relative overflow-x-hidden">
            {/* Ambient background glows */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-64 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full opacity-25"
                    style={{ background: 'radial-gradient(ellipse, rgba(124,134,255,0.18) 0%, transparent 65%)' }} />
                <div className="absolute top-1/3 -right-32 h-[400px] w-[400px] rounded-full opacity-15"
                    style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)' }} />
            </div>

            {/* ── Nav ── */}
            <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b px-6 backdrop-blur-2xl"
                style={{ background: 'rgba(9,9,13,0.88)', borderColor: 'var(--color-border)' }}>
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <Logo size={24} />
                    <span className="text-[15px] font-semibold tracking-tight">Archy</span>
                    <span className="mono-label px-1.5 py-0.5 rounded text-[9px]"
                        style={{ background: 'rgba(124,134,255,0.12)', border: '1px solid rgba(124,134,255,0.22)', color: 'var(--color-accent)' }}>
                        v0.5
                    </span>
                </div>
                {/* Nav right */}
                <div className="flex items-center gap-4">
                    {/* AI badge */}
                    <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium transition-all ${apiStatus.available ? 'text-emerald-400' : 'text-amber-400'}`}
                        style={{
                            borderColor: apiStatus.available ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)',
                            background: apiStatus.available ? 'rgba(52,211,153,0.07)' : 'rgba(251,191,36,0.07)',
                        }}
                        title={apiStatus.message}>
                        <span className={`w-1.5 h-1.5 rounded-full ${apiStatus.available ? 'bg-emerald-400' : 'bg-amber-400'} accent-pulse`} />
                        {apiStatus.available ? 'AI Online' : 'AI Offline'}
                    </div>
                    {/* GitHub */}
                    <a href="https://github.com/kvmil6/Archy" target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--color-text)]"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <Github className="w-4 h-4" />
                        <span className="hidden sm:inline">GitHub</span>
                    </a>
                    {/* Avatar */}
                    <a href="https://github.com/kvmil6" target="_blank" rel="noreferrer"
                        className="group hidden md:flex items-center gap-2 pl-4 border-l"
                        style={{ borderColor: 'var(--color-border)' }}>
                        <img src="https://github.com/kvmil6.png" alt="@kvmil6"
                            className="h-6 w-6 rounded-full border transition-all group-hover:border-[var(--color-accent)]"
                            style={{ borderColor: 'var(--color-border-strong)' }} />
                        <span className="text-[12px] font-mono transition-colors group-hover:text-[var(--color-text)]"
                            style={{ color: 'var(--color-text-muted)' }}>@kvmil6</span>
                    </a>
                </div>
            </nav>

            {/* Accent line under nav */}
            <div className="h-px w-full"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(124,134,255,0.5) 50%, transparent 100%)' }} />

            {/* ── Hero ── */}
            <section className="relative mx-auto max-w-[1080px] px-6 pt-20 pb-16">
                {/* Badge row */}
                <div className="mb-7 flex flex-wrap items-center gap-2">
                    {[
                        { label: 'Local-first', color: 'rgba(124,134,255,0.18)', text: '#a5abff', border: 'rgba(124,134,255,0.3)' },
                        { label: 'AST-powered', color: 'rgba(52,211,153,0.1)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
                        { label: 'Open source', color: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
                    ].map(b => (
                        <span key={b.label} className="rounded-full px-3 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest border"
                            style={{ background: b.color, color: b.text, borderColor: b.border }}>
                            {b.label}
                        </span>
                    ))}
                </div>

                {/* Headline */}
                <h1 className="mb-6 text-[3.6rem] font-extrabold leading-[1.04] tracking-[-0.04em] md:text-[4.5rem]">
                    <span style={{ color: 'var(--color-text)' }}>See your Python<br />backend — </span>
                    <span className="text-gradient-brand">as a graph.</span>
                </h1>

                {/* Sub */}
                <p className="max-w-[560px] text-[17px] leading-[1.65]" style={{ color: 'var(--color-text-secondary)' }}>
                    Archy parses your Django, FastAPI, or Flask project with real AST analysis
                    and builds a live interactive graph. Add AI insights, security scans, and DB schemas — no config required.
                </p>

                {/* CTA */}
                <div className="mt-10 flex flex-wrap items-center gap-4">
                    <button
                        onClick={handleOpenProject}
                        disabled={isScanning}
                        className="group relative flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-[15px] font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                            background: 'linear-gradient(135deg, #7c86ff 0%, #6366f1 100%)',
                            boxShadow: '0 0 0 1px rgba(124,134,255,0.5), 0 8px 32px rgba(124,134,255,0.3)',
                        }}>
                        {isScanning ? (
                            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Scanning...</>
                        ) : (
                            <><FolderSearch className="h-4.5 w-4.5" />Open project<ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></>
                        )}
                    </button>
                    <div className="flex items-center gap-1.5 text-[12px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                        <span className="kbd">⌘</span><span className="kbd">O</span>
                        <span className="ml-1">keyboard shortcut</span>
                    </div>
                    <button
                        onClick={() => handleTryDemo('sample_django')}
                        disabled={isScanning}
                        className="group flex items-center gap-2 rounded-xl border px-5 py-3 text-[14px] font-medium transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                            borderColor: 'var(--color-border-strong)',
                            color: 'var(--color-text-secondary)',
                            background: 'rgba(255,255,255,0.03)',
                        }}
                    >
                        <Sparkles className="h-4 w-4" style={{ color: '#fbbf24' }} />
                        Try a demo project
                    </button>
                </div>

                {!isTauri() && !isElectron() && typeof (window as any).showDirectoryPicker === 'undefined' && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px]"
                        style={{ borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)', color: '#fbbf24' }}>
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Your browser doesn't support folder access. Use Chrome, Edge, or the desktop app.
                    </div>
                )}

                {/* Framework strip */}
                <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="mono-label text-[9px]">Works with</span>
                    {[
                        { name: 'Django', color: '#4ade80' },
                        { name: 'FastAPI', color: '#22d3ee' },
                        { name: 'Flask', color: '#fb923c' },
                        { name: 'Starlette', color: '#a78bfa' },
                        { name: 'SQLAlchemy', color: '#f9a8d4' },
                        { name: 'Pydantic', color: '#7c86ff' },
                    ].map(f => (
                        <span key={f.name} className="text-[12px] font-mono font-semibold" style={{ color: f.color }}>
                            {f.name}
                        </span>
                    ))}
                </div>
            </section>

            {/* ── Main content ── */}
            <main className="relative mx-auto max-w-[1080px] px-6 pb-24">

                {/* ── Config row (path + model + API key) ── */}
                <div className="mb-14 grid gap-4 md:grid-cols-[1fr,auto]">
                    {/* Left: path + model */}
                    <div className="rounded-2xl border p-6"
                        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)' }}>
                        <div className="mono-label mb-4">PROJECT SETTINGS</div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                    Project path <span style={{ color: 'var(--color-text-faint)' }}>(optional, for editor launch)</span>
                                </label>
                                <input
                                    type="text"
                                    spellCheck={false}
                                    autoComplete="off"
                                    value={projectPath}
                                    onChange={(e) => setProjectPath(e.target.value)}
                                    placeholder="/Users/you/projects/myapp"
                                    className="w-full rounded-lg border px-3 py-2 font-mono text-[12.5px] outline-none transition-colors placeholder:opacity-40"
                                    style={{
                                        background: 'var(--color-bg-subtle)',
                                        borderColor: 'var(--color-border)',
                                        color: 'var(--color-text)',
                                    }}
                                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                    AI model
                                </label>
                                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
                            </div>
                        </div>
                    </div>

                    {/* Right: API key */}
                    <div className="rounded-2xl border p-6 min-w-[280px]"
                        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="mono-label">OPENROUTER KEY</div>
                            {apiStatus.available ? (
                                <span className="flex items-center gap-1 text-[10px] font-mono font-semibold" style={{ color: 'var(--color-success)' }}>
                                    <Check className="h-3 w-3" />ACTIVE
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-[10px] font-mono font-semibold" style={{ color: 'var(--color-warning)' }}>
                                    <X className="h-3 w-3" />NOT SET
                                </span>
                            )}
                        </div>

                        {apiStatus.available && apiStatus.keySource && (
                            <div className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-mono border"
                                style={{ background: 'rgba(52,211,153,0.06)', borderColor: 'rgba(52,211,153,0.2)', color: 'var(--color-success)' }}>
                                <Check className="h-3 w-3 shrink-0" />
                                Auto-detected from <strong style={{ color: 'var(--color-text-secondary)' }}>{apiStatus.keySource === 'dotenv' ? '.env file' : apiStatus.keySource}</strong>
                            </div>
                        )}

                        <ApiKeyInputRow
                            value={apiKeyInput}
                            onChange={setApiKeyInput}
                            onSave={saveApiKey}
                            onTest={testConnection}
                            saveState={saveState}
                            keyConfigured={apiStatus.available}
                        />
                    </div>
                </div>

                {/* ── Feature strip ── */}
                <div className="mb-14">
                    <div className="mono-label mb-5">CAPABILITIES</div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { icon: <Cpu className="h-4 w-4" />, color: '#7c86ff', title: 'Python AST', desc: 'Real parse tree — classes, methods, imports.' },
                            { icon: <GitBranch className="h-4 w-4" />, color: '#34d399', title: 'Dependency graph', desc: 'Models, views, routes wired automatically.' },
                            { icon: <Sparkles className="h-4 w-4" />, color: '#a78bfa', title: 'AI insights', desc: 'Claude, GPT-4o, Llama via OpenRouter.' },
                            { icon: <ShieldCheck className="h-4 w-4" />, color: '#f87171', title: 'Security scan', desc: 'Architecture smells, god classes, orphans.' },
                            { icon: <Database className="h-4 w-4" />, color: '#22d3ee', title: 'DB inspector', desc: 'SQLite schema merge & visualization.' },
                            { icon: <Gauge className="h-4 w-4" />, color: '#fbbf24', title: 'Complexity metrics', desc: 'Cyclomatic + LOC — catch hot spots early.' },
                            { icon: <Activity className="h-4 w-4" />, color: '#f59e0b', title: 'Activity log', desc: 'Live event stream of every backend action.' },
                            { icon: <Code2 className="h-4 w-4" />, color: '#60a5fa', title: 'HTTP tester', desc: 'Built-in Postman-lite — test endpoints live.' },
                        ].map(f => <FeatureCard key={f.title} {...f} />)}
                    </div>
                </div>

                {/* ── Workspace dashboard ── */}
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="mono-label">YOUR WORKSPACES</div>
                            {recentProjects.length > 0 && (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                                    style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
                                    {recentProjects.length}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleOpenProject}
                            disabled={isScanning}
                            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
                            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}>
                            <Plus className="h-3.5 w-3.5" />New workspace
                        </button>
                    </div>

                    {recentProjects.length === 0 ? (
                        /* Empty state */
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
                            style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)' }}>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
                                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border-strong)' }}>
                                <FolderOpen className="h-6 w-6" style={{ color: 'var(--color-text-faint)' }} />
                            </div>
                            <p className="mb-1.5 text-[15px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                No workspaces yet
                            </p>
                            <p className="mb-6 text-[13px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                                Open a Python project to get started
                            </p>
                            <button
                                onClick={handleOpenProject}
                                disabled={isScanning}
                                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-all disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #7c86ff, #6366f1)', boxShadow: '0 4px 20px rgba(124,134,255,0.3)' }}>
                                <FolderSearch className="h-4 w-4" />Open project folder
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {recentProjects.map(p => {
                                const isEditing = editingProjectId === p.id;
                                const isConfirmDelete = confirmDeleteId === p.id;
                                const FW_COLORS: Record<string, string> = {
                                    fastapi: '#22d3ee', django: '#4ade80', flask: '#fb923c',
                                    starlette: '#a78bfa', express: '#f9a8d4', unknown: '#6b7280',
                                };
                                const fwColor = FW_COLORS[(p.framework ?? '').toLowerCase()] ?? '#6b7280';

                                return (
                                    <div key={p.id}
                                        className="group relative overflow-hidden rounded-2xl border transition-all hover:border-white/15"
                                        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)' }}>
                                        {/* Accent top stripe */}
                                        <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${fwColor} 0%, transparent 70%)` }} />

                                        <div className="p-4">
                                            {/* Header */}
                                            <div className="flex items-start gap-3 mb-3.5">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold font-mono"
                                                    style={{ background: `${fwColor}18`, color: fwColor }}>
                                                    {(p.name?.[0] ?? '?').toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    {isEditing ? (
                                                        <input autoFocus value={editingName}
                                                            onChange={e => setEditingName(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleRenameProject(p.id);
                                                                if (e.key === 'Escape') { setEditingProjectId(null); setEditingName(''); }
                                                            }}
                                                            onClick={e => e.stopPropagation()}
                                                            className="w-full rounded-lg border px-2 py-0.5 text-[13px] font-semibold outline-none"
                                                            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-accent)', color: 'var(--color-text)' }}
                                                        />
                                                    ) : (
                                                        <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>{p.name}</div>
                                                    )}
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase"
                                                            style={{ background: `${fwColor}18`, color: fwColor }}>
                                                            {p.framework || 'unknown'}
                                                        </span>
                                                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                                                            {p.nodes?.length ?? 0} nodes · {p.edges?.length ?? 0} edges
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Path */}
                                            {p.projectPath && (
                                                <div className="mb-3 truncate rounded-lg px-2 py-1.5 text-[10px] font-mono"
                                                    title={p.projectPath}
                                                    style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-faint)', border: '1px solid var(--color-border)' }}>
                                                    {p.projectPath}
                                                </div>
                                            )}

                                            {/* Stats row */}
                                            <div className="mb-4 flex flex-wrap items-center gap-3 text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />{formatRelativeTime(p.updatedAt)}
                                                </span>
                                                {(p.files?.length ?? 0) > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <Code2 className="h-3 w-3" />{p.files.length} files
                                                    </span>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            {isEditing ? (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleRenameProject(p.id)}
                                                        className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-white transition-all"
                                                        style={{ background: 'var(--color-accent)' }}>
                                                        <Check className="h-3 w-3" />Save
                                                    </button>
                                                    <button onClick={() => { setEditingProjectId(null); setEditingName(''); }}
                                                        className="flex items-center justify-center rounded-lg border px-3 py-1.5 text-[11px] transition-colors"
                                                        style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}>
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ) : isConfirmDelete ? (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleDeleteProject(p.id)}
                                                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-all"
                                                        style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>
                                                        <Trash2 className="h-3 w-3" />Confirm
                                                    </button>
                                                    <button onClick={() => setConfirmDeleteId(null)}
                                                        className="flex items-center justify-center rounded-lg border px-3 py-1.5 transition-colors"
                                                        style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}>
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button onClick={() => openSavedProject(p)}
                                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white transition-all hover:brightness-110"
                                                        style={{ background: 'linear-gradient(135deg, #7c86ff, #6366f1)', boxShadow: '0 2px 12px rgba(124,134,255,0.25)' }}>
                                                        <ArrowUpRight className="h-3.5 w-3.5" />Open
                                                    </button>
                                                    <button onClick={() => { setEditingProjectId(p.id); setEditingName(p.name); }}
                                                        className="flex items-center justify-center rounded-lg border px-2.5 py-2 transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                                                        style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-faint)' }}
                                                        title="Rename">
                                                        <Edit3 className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button onClick={() => setConfirmDeleteId(p.id)}
                                                        className="flex items-center justify-center rounded-lg border px-2.5 py-2 transition-all hover:border-red-500/40 hover:text-red-400"
                                                        style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-faint)' }}
                                                        title="Delete">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Footer row ── */}
                <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-8" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex flex-wrap items-center gap-5 text-[11px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                        <span className="flex items-center gap-1.5"><span className="kbd">⌘</span><span className="kbd">O</span><span className="ml-1">Open project</span></span>
                        <span className="flex items-center gap-1.5"><span className="kbd">⌘</span><span className="kbd">K</span><span className="ml-1">Command palette</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
                        <Activity className="h-3 w-3" />100% local analysis
                    </div>
                </div>
            </main>
        </div>
    );
}

function FeatureCard({ icon, color, title, desc }: {
    icon: React.ReactNode;
    color: string;
    title: string;
    desc: string;
}) {
    return (
        <div
            className="group flex items-start gap-3 rounded-xl border p-4 transition-all hover:border-white/12"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)' }}
        >
            <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${color}18`, color }}
            >
                {icon}
            </div>
            <div className="min-w-0">
                <h3 className="text-[13px] font-semibold tracking-tight mb-0.5" style={{ color: 'var(--color-text)' }}>{title}</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{desc}</p>
            </div>
        </div>
    );
}


function StatStrip({ icon, label, value }: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div
            className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
            <span className="text-[var(--color-text-muted)]">{icon}</span>
            <div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
                <div className="text-[11px] font-medium">{value}</div>
            </div>
        </div>
    );
}

/**
 * API key input with save button that transitions through:
 *   idle → saving → validating → online | error
 * Shows inline status feedback with latency, credits, and tier on success.
 */
function ApiKeyInputRow({
    value,
    onChange,
    onSave,
    onTest,
    saveState,
    keyConfigured,
}: {
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
    onTest: () => void;
    saveState: SaveState;
    keyConfigured: boolean;
}) {
    const busy = saveState.phase === 'saving' || saveState.phase === 'validating';
    const hasInput = value.trim().length > 0;

    // Button label/icon by phase
    let btnLabel: React.ReactNode = 'Save API';
    let btnIcon: React.ReactNode = <ShieldCheck className="w-3.5 h-3.5" />;
    let btnColor = 'var(--color-accent)';
    if (saveState.phase === 'saving') {
        btnLabel = 'Saving...';
        btnIcon = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    } else if (saveState.phase === 'validating') {
        const ms = (saveState as { phase: 'validating'; elapsedMs: number }).elapsedMs;
        btnLabel = `Validating · ${(ms / 1000).toFixed(1)}s`;
        btnIcon = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    } else if (saveState.phase === 'online') {
        btnLabel = 'Online';
        btnIcon = <Wifi className="w-3.5 h-3.5" />;
        btnColor = '#10b981'; // green
    } else if (saveState.phase === 'error') {
        btnLabel = 'Retry';
        btnIcon = <RefreshCw className="w-3.5 h-3.5" />;
        btnColor = '#ef4444'; // red
    }

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    type="password"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && hasInput && !busy) onSave();
                    }}
                    placeholder="sk-or-v1-..."
                    spellCheck={false}
                    autoComplete="off"
                    disabled={busy}
                    className="flex-1 font-mono text-[12px] bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-md px-3 py-2 outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-text-faint)] disabled:opacity-60"
                />
                <button
                    onClick={onSave}
                    disabled={busy || !hasInput}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                        background: busy
                            ? 'var(--color-surface-hover)'
                            : hasInput
                            ? btnColor
                            : 'var(--color-bg-subtle)',
                        color: busy || !hasInput ? 'var(--color-text-muted)' : 'white',
                        border: `1px solid ${hasInput && !busy ? btnColor : 'var(--color-border-strong)'}`,
                    }}
                >
                    {btnIcon}
                    {btnLabel}
                </button>
                {keyConfigured && !busy && saveState.phase !== 'online' && (
                    <button
                        onClick={onTest}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium border hover:bg-white/5 transition-colors"
                        style={{
                            borderColor: 'var(--color-border-strong)',
                            color: 'var(--color-text-muted)',
                        }}
                        title="Test the currently-saved key"
                    >
                        <Wifi className="w-3.5 h-3.5" />
                        Test
                    </button>
                )}
            </div>

            {/* Status row */}
            <StatusBanner state={saveState} />

            <p className="text-[11px] text-[var(--color-text-faint)] font-mono">
                Saved live — no restart needed · Get key at{' '}
                <a
                    href="https://openrouter.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-accent)] hover:underline"
                >
                    openrouter.ai
                </a>
            </p>
        </div>
    );
}

function StatusBanner({ state }: { state: SaveState }) {
    if (state.phase === 'idle' || state.phase === 'saving') return null;

    if (state.phase === 'validating') {
        return (
            <div
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-mono border"
                style={{
                    background: 'rgba(59, 130, 246, 0.06)',
                    borderColor: 'rgba(59, 130, 246, 0.25)',
                    color: '#60a5fa',
                }}
            >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Pinging openrouter.ai/api/v1/auth/key...</span>
            </div>
        );
    }

    if (state.phase === 'online') {
        const latency = state.latencyMs;
        const credits = state.credits;
        const tier = state.tier;
        return (
            <div
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-mono border"
                style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                }}
            >
                <Wifi className="w-3.5 h-3.5" />
                <span className="font-semibold">Online</span>
                {latency !== undefined && (
                    <>
                        <span className="text-[var(--color-text-faint)]">·</span>
                        <span>{latency}ms</span>
                    </>
                )}
                {credits !== undefined && credits !== null && (
                    <>
                        <span className="text-[var(--color-text-faint)]">·</span>
                        <span>${credits.toFixed(2)} credits</span>
                    </>
                )}
                {tier && (
                    <>
                        <span className="text-[var(--color-text-faint)]">·</span>
                        <span className="uppercase">{tier}</span>
                    </>
                )}
            </div>
        );
    }

    // error
    const icon =
        state.kind === 'invalid' ? (
            <AlertCircle className="w-3.5 h-3.5" />
        ) : state.kind === 'rate_limited' ? (
            <AlertTriangle className="w-3.5 h-3.5" />
        ) : (
            <WifiOff className="w-3.5 h-3.5" />
        );
    const label =
        state.kind === 'invalid'
            ? 'Invalid key'
            : state.kind === 'rate_limited'
            ? 'Rate limited'
            : 'Connection failed';
    return (
        <div
            className="flex items-start gap-2 px-3 py-2 rounded-md text-[11px] border"
            style={{
                background: 'rgba(239, 68, 68, 0.06)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: '#f87171',
            }}
        >
            <span className="flex-shrink-0 mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0 font-mono">
                <div className="font-semibold">{label}</div>
                <div className="text-[10px] mt-0.5 opacity-90 break-words">{state.message}</div>
            </div>
        </div>
    );
}
