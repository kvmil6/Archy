import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    useReactFlow,
    ReactFlowProvider,
    ConnectionLineType,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Brain,
    Wand2,
    ArrowLeft,
    RefreshCw,
    Command as CommandIcon,
    GitBranch,
    AlertTriangle,
    Zap,
    Activity,
    FileCode,
    Filter,
    StickyNote,
    Maximize2,
    Trash2,
    PanelLeftClose,
    PanelLeft,
    Shield,
    ShieldCheck,
    TerminalSquare,
    Globe,
    Stethoscope,
    Server,
    BookOpen,
    GitCompare,
} from 'lucide-react';
import { BACKEND_URL } from '@/services/apiClient';
import { getFileContent } from '@/services/fileSystem';
import { applyClientLayout } from '@/utils/layoutEngine';

import { Sidebar } from '@/components/Sidebar';
import { nodeTypes, getNodeConfig, NODE_TYPE_LIST } from '@/components/NodeTypes';
import { useGraphStore } from '@/store/useGraphStore';
import { AIBrainPanel } from '@/components/AIBrainPanel';
import { ExportArchitectureModal } from '@/components/ExportArchitectureModal';
import { CommandPalette, type Command, commandIcons } from '@/components/CommandPalette';
import { TerminalPanel } from '@/components/TerminalPanel';
import { HTTPRequestPanel } from '@/components/HTTPRequestPanel';
import { ArchDoctorPanel } from '@/components/ArchDoctorPanel';
import { analyzeProject, localQuickAnalyze, type AnalysisResult } from '@/services/architectureAnalyzer';
import { FileDetailPanel } from '@/components/FileDetailPanel';
import { EnvPanel } from '@/components/EnvPanel';
import { SecurityPanel } from '@/components/SecurityPanel';
import { HealthPill, HealthScorePanel, type HealthData } from '@/components/HealthScorePanel';
import { CanvasEditorPanel } from '@/components/CanvasEditorPanel';
import { MCPSettingsPanel } from '@/components/MCPSettingsPanel';
import { OnboardingPanel } from '@/components/OnboardingPanel';
import { DiffPanel, type DiffResult } from '@/components/DiffPanel';
import { TraceOverlayPanel } from '@/components/TraceOverlayPanel';
import { GraphSecurityPanel, SecurityBadge } from '@/components/GraphSecurityPanel';
import { Logo } from '@/components/Logo';
import { useToast } from '@/components/Toast';
import { useTrace, describeTrace } from '@/hooks/useTrace';
import { GraphSearch } from '@/components/GraphSearch';
import { RuntimeInsightsPanel } from '@/components/RuntimeInsightsPanel';
import {
    saveProject,
    createProjectId,
    type SavedProject,
} from '@/services/projectManager';
import {
    detectDatabases,
    inspectDatabase,
    mergeDBFragment,
    detectDBConnectionsFromEnv,
    type DBCandidate,
    type DBConnectionInfo,
} from '@/services/databaseInspector';
import {
    exportGraphAsSvg,
    exportGraphAsPng,
    exportGraphAsJson,
} from '@/services/graphExport';
import { trackRuntimeEvent } from '@/services/runtimeInsights';

/** Diagram-style edges: bright neutral curves (reference: architecture graph docs). */
function getEdgeStyle(sourceType: string): React.CSSProperties {
    const styles: Record<string, React.CSSProperties> = {
        app:            { stroke: 'rgba(252, 231, 243, 0.55)', strokeWidth: 1.75 },
        module:         { stroke: 'rgba(204, 251, 241, 0.5)',  strokeWidth: 1.75 },
        entryInterface: { stroke: 'rgba(219, 234, 254, 0.52)', strokeWidth: 1.7 },
        controller:     { stroke: 'rgba(224, 231, 255, 0.52)', strokeWidth: 1.7 },
        diContainer:    { stroke: 'rgba(207, 250, 254, 0.5)',  strokeWidth: 1.65 },
        service:        { stroke: 'rgba(224, 242, 254, 0.5)',  strokeWidth: 1.65 },
        route:          { stroke: 'rgba(237, 233, 254, 0.5)',  strokeWidth: 1.65 },
        repository:     { stroke: 'rgba(255, 237, 213, 0.48)', strokeWidth: 1.65 },
        model:          { stroke: 'rgba(220, 252, 231, 0.48)', strokeWidth: 1.65 },
        schema:         { stroke: 'rgba(254, 243, 199, 0.48)', strokeWidth: 1.65 },
    };
    return styles[sourceType] ?? { stroke: 'rgba(255, 255, 255, 0.42)', strokeWidth: 1.65 };
}

export default function CanvasPageWrapper() {
    return (
        <ReactFlowProvider>
            <CanvasPage />
        </ReactFlowProvider>
    );
}

function CanvasPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const toast = useToast();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [isBrainOpen, setIsBrainOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isCmdKOpen, setIsCmdKOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [insights, setInsights] = useState<AnalysisResult['insights'] | null>(null);
    const [metrics, setMetrics] = useState<AnalysisResult['metrics'] | null>(null);
    const [showInsightsPanel, setShowInsightsPanel] = useState(false);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const openEditorInFlightRef = useRef(false);
    const [traceSource, setTraceSource] = useState<string | null>(null);
    const [traceDirection, setTraceDirection] = useState<'downstream' | 'upstream' | 'both'>('downstream');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [dbCandidates, setDbCandidates] = useState<DBCandidate[]>([]);
    const [loadedDbPath, setLoadedDbPath] = useState<string | null>(null);
    const [dbLoading, setDbLoading] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);
    const [dbConnections, setDbConnections] = useState<DBConnectionInfo[]>([]);
    const [layoutMode, setLayoutMode] = useState<'hierarchical' | 'radial' | 'tree' | 'force' | 'hub'>('hierarchical');
    const [isLayouting, setIsLayouting] = useState(false);
    const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    /** When true, Django migration files are not parsed into the graph (recommended). */
    const [excludeMigrations, setExcludeMigrations] = useState(true);
    /** Sidebar collapse state */
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    /** Environment variables panel */
    const [isEnvPanelOpen, setIsEnvPanelOpen] = useState(false);
    /** Security panel */
    const [isSecurityOpen, setIsSecurityOpen] = useState(false);
    const [isRuntimeOpen, setIsRuntimeOpen] = useState(false);
    const [isArchDoctorOpen, setIsArchDoctorOpen] = useState(false);
    const [isHealthOpen, setIsHealthOpen] = useState(false);
    const [healthData, setHealthData] = useState<HealthData | null>(null);
    /** File currently open in the Monaco canvas editor */
    const [editorFile, setEditorFile] = useState<string | null>(null);
    const [editorScrollLine, setEditorScrollLine] = useState<number | undefined>(undefined);
    const [isMCPOpen, setIsMCPOpen] = useState(false);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [isDiffOpen, setIsDiffOpen] = useState(false);
    const [activeDiff, setActiveDiff] = useState<DiffResult | null>(null);
    const [isTraceOpen, setIsTraceOpen] = useState(false);
    const [isGraphSecurityOpen, setIsGraphSecurityOpen] = useState(false);
    const [securityIssueCount, setSecurityIssueCount] = useState(0);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    /** Developer tools bottom panel: 'terminal' | 'http' | null */
    const [devPanel, setDevPanel] = useState<'terminal' | 'http' | null>(null);
    const toggleDevPanel = (panel: 'terminal' | 'http') =>
        setDevPanel(prev => prev === panel ? null : panel);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        setNodes,
        setEdges,
        setFramework,
        removeSelectedNodes,
    } = useGraphStore();

    const analysisRanRef = useRef(false);

    useEffect(() => {
        setNodes([]);
        setEdges([]);
        analysisRanRef.current = false;
        const fw = location.state?.framework;
        if (fw) setFramework(fw);
    }, [location.state?.projectPath]);

    const { screenToFlowPosition, fitView, setCenter, getNode } = useReactFlow();

    const addCanvasNote = useCallback(() => {
        if (!reactFlowWrapper.current) return;
        const rect = reactFlowWrapper.current.getBoundingClientRect();
        const p = screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        });
        addNode({
            id: `canvasCard-${Date.now()}`,
            type: 'canvasCard',
            position: { x: p.x - 140, y: p.y - 72 },
            data: {
                label: 'New note',
                body: '**Overview**\n\n- Add bullets with -\n- Use **bold** like this',
            },
        });
    }, [screenToFlowPosition, addNode]);

    const focusNode = useCallback(
        (nodeId: string) => {
            const node = getNode(nodeId);
            if (!node) return;
            const x = node.position.x + (node.measured?.width ?? node.width ?? 280) / 2;
            const y = node.position.y + (node.measured?.height ?? node.height ?? 120) / 2;
            setCenter(x, y, { zoom: 1.4, duration: 600 });
        },
        [getNode, setCenter],
    );

    const runAnalysis = useCallback(async () => {
        const files = location.state?.files as string[] | undefined;
        if (!files || files.length === 0) return;

        const analysisStartedAt = performance.now();
        void trackRuntimeEvent({
            event_type: 'analysis',
            command: 'reanalyze-project',
            status: 'started',
            metadata: { exclude_migrations: excludeMigrations },
        });

        setIsAnalyzing(true);
        setAnalysisError(null);
        setNodes([]);
        setEdges([]);

        try {
            const result = await analyzeProject(files, { excludeMigrations });

            if (result && result.nodes.length > 0) {
                const degree = new Map<string, number>();
                for (const e of result.edges) {
                    degree.set(e.source, (degree.get(e.source) || 0) + 1);
                    degree.set(e.target, (degree.get(e.target) || 0) + 1);
                }
                const maxDeg = Math.max(1, ...degree.values());

                const enrichedNodes = result.nodes.map(n => ({
                    ...n,
                    data: {
                        ...n.data,
                        importance: (degree.get(n.id) || 0) / maxDeg,
                        edgeDegree: degree.get(n.id) || 0,
                    },
                }));

                const laidOutNodes = applyClientLayout(enrichedNodes as any, result.edges as any, layoutMode);

                const nodeTypeMap = new Map(result.nodes.map(n => [n.id, n.type]));
                const enrichedEdges = result.edges.map(e => {
                    const srcType = nodeTypeMap.get(e.source) || '';
                    const style = getEdgeStyle(srcType);
                    return {
                        ...e,
                        type: 'default',
                        style,
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            width: 10,
                            height: 10,
                            color: (style as any).stroke,
                        },
                    };
                });

                setNodes(laidOutNodes as any);
                setEdges(enrichedEdges as any);
                setInsights(result.insights);
                setMetrics(result.metrics);

                const detectedFramework = (result as any).framework_detection?.framework;
                if (detectedFramework && detectedFramework !== 'unknown') {
                    setFramework(detectedFramework);
                }

                setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 150);

                // Compute health score
                if (result.insights) {
                    try {
                        const hsRes = await fetch(`${BACKEND_URL}/analyze/health-score`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ insights: result.insights, metrics: result.metrics }),
                        });
                        if (hsRes.ok) setHealthData(await hsRes.json());
                    } catch { /* silent */ }
                }

                toast.success(
                    `Parsed ${result.metrics.total_files} files${excludeMigrations ? ' · migrations omitted' : ''}`,
                    `${result.nodes.length} nodes · ${result.edges.length} edges · ${result.metrics.total_classes} classes`,
                );
                void trackRuntimeEvent({
                    event_type: 'analysis',
                    command: 'reanalyze-project',
                    status: 'success',
                    duration_ms: Math.round(performance.now() - analysisStartedAt),
                    metadata: { parser: 'backend', files: result.metrics.total_files },
                });
            } else {
                const local = localQuickAnalyze(files, { excludeMigrations });
                const laidOutNodes = applyClientLayout(local.nodes as any, local.edges as any, layoutMode);
                setNodes(laidOutNodes as any);
                setEdges(local.edges as any);
                setInsights(local.insights);
                setMetrics(local.metrics);
                setAnalysisError('Backend parser unavailable — showing local quick analysis');
                setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 150);
                toast.warning(
                    'Using local fallback parser',
                    'Backend unreachable — relationships and complexity metrics disabled. Check backend is running on :8000.',
                );
                void trackRuntimeEvent({
                    event_type: 'analysis',
                    command: 'reanalyze-project',
                    status: 'success',
                    duration_ms: Math.round(performance.now() - analysisStartedAt),
                    metadata: { parser: 'local-fallback', files: local.metrics.total_files },
                });
            }
        } catch (err) {
            console.error('Analysis failed', err);
            setAnalysisError('Analysis failed');
            toast.error(
                'Analysis failed',
                (err as Error).message || 'Unknown error',
            );
            void trackRuntimeEvent({
                event_type: 'analysis',
                command: 'reanalyze-project',
                status: 'error',
                duration_ms: Math.round(performance.now() - analysisStartedAt),
                metadata: { error: (err as Error).message || 'Unknown error' },
            });
        } finally {
            setIsAnalyzing(false);
        }
    }, [location.state?.files, setNodes, setEdges, fitView, toast, layoutMode, excludeMigrations, setFramework]);

    const hasRestoredGraph = Array.isArray(location.state?.restoredNodes) && location.state.restoredNodes.length > 0;

    useEffect(() => {
        if (!hasRestoredGraph) return;
        const restoredNodes = (location.state?.restoredNodes as any[]) || [];
        const restoredEdges = (location.state?.restoredEdges as any[]) || [];
        const restoredProjectId = location.state?.projectId as string | undefined;
        if (restoredNodes.length === 0) return;
        setNodes(restoredNodes as any);
        setEdges(restoredEdges as any);
        if (restoredProjectId) setCurrentProjectId(restoredProjectId);
        const restoredInsights = location.state?.restoredInsights as AnalysisResult['insights'] | undefined;
        const restoredMetrics = location.state?.restoredMetrics as AnalysisResult['metrics'] | undefined;
        if (restoredInsights) setInsights(restoredInsights);
        if (restoredMetrics) setMetrics(restoredMetrics);
        setTimeout(() => fitView({ padding: 0.2, duration: 450 }), 120);
    }, [hasRestoredGraph, location.state?.restoredNodes, location.state?.restoredEdges, location.state?.restoredInsights, location.state?.restoredMetrics, location.state?.projectId, setNodes, setEdges, fitView]);

    useEffect(() => {
        if (!hasRestoredGraph && location.state?.files?.length > 0 && !analysisRanRef.current) {
            analysisRanRef.current = true;
            runAnalysis();
        }
    }, [location.state?.files, hasRestoredGraph, runAnalysis]);

    useEffect(() => {
        const projectPath = location.state?.projectPath as string | undefined;
        if (!projectPath) return;
        detectDatabases(projectPath)
            .then((cands) => setDbCandidates(cands))
            .catch((err) => console.warn('DB detection failed:', err));
    }, [location.state?.projectPath]);

    useEffect(() => {
        const projectFiles = location.state?.files as string[] | undefined;
        if (!projectFiles) return;
        const envFiles = projectFiles.filter((f) => {
            const name = f.split('/').pop()?.toLowerCase() || '';
            return name.startsWith('.env');
        });
        if (envFiles.length === 0) return;

        (async () => {
            const allConns: DBConnectionInfo[] = [];
            for (const envPath of envFiles) {
                try {
                    const content = await getFileContent(envPath);
                    if (content) {
                        const conns = detectDBConnectionsFromEnv(content, envPath.split('/').pop());
                        allConns.push(...conns);
                    }
                } catch { /* skip */ }
            }
            if (allConns.length > 0) setDbConnections(allConns);
        })();
    }, [location.state?.files]);

    const projectPath = (location.state?.projectPath as string) || '';
    const projectFiles = (location.state?.files as string[]) || [];
    const routeProjectId = location.state?.projectId as string | undefined;
    const routeModel = (location.state?.model as string) || '';
    const autosaveProjectName = (location.state?.projectName as string) || 'Untitled';
    const autosaveFramework = (location.state?.framework as string) || '';

    useEffect(() => {
        if (nodes.length === 0) return;
        const timer = setTimeout(() => {
            const id = currentProjectId || routeProjectId || createProjectId();
            const proj: SavedProject = {
                id,
                name: autosaveProjectName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                projectPath,
                framework: autosaveFramework,
                model: routeModel,
                files: projectFiles,
                nodes,
                edges,
                insights,
                metrics,
            };
            saveProject(proj)
                .then((persistedId) => {
                    if (persistedId !== currentProjectId) {
                        setCurrentProjectId(persistedId);
                    }
                })
                .catch(() => {});
        }, 3000);
        return () => clearTimeout(timer);
    }, [
        nodes,
        edges,
        insights,
        metrics,
        currentProjectId,
        routeProjectId,
        autosaveProjectName,
        projectPath,
        projectFiles,
        autosaveFramework,
        routeModel,
    ]);

    /** Inspect a DB file and merge its schema into the graph. */
    const loadDatabase = useCallback(
        async (dbPath: string) => {
            const startedAt = performance.now();
            void trackRuntimeEvent({
                event_type: 'database',
                command: 'inspect-database',
                status: 'started',
                metadata: { db_path: dbPath },
            });
            setDbLoading(true);
            setDbError(null);
            try {
                const classLabels = nodes
                    .map((n) => (n.data as any)?.label)
                    .filter(Boolean) as string[];
                const fragment = await inspectDatabase(dbPath, classLabels);
                const merged = mergeDBFragment(nodes, edges, fragment);
                setNodes(merged.nodes as any);
                setEdges(merged.edges as any);
                setLoadedDbPath(dbPath);
                setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
                toast.success(
                    'Database schema loaded',
                    `${fragment.metadata.table_count} tables · ${fragment.edges.length} relationships merged`,
                );
                void trackRuntimeEvent({
                    event_type: 'database',
                    command: 'inspect-database',
                    status: 'success',
                    duration_ms: Math.round(performance.now() - startedAt),
                    metadata: { db_path: dbPath, tables: fragment.metadata.table_count },
                });
            } catch (err) {
                setDbError((err as Error).message);
                toast.error('Database load failed', (err as Error).message);
                void trackRuntimeEvent({
                    event_type: 'database',
                    command: 'inspect-database',
                    status: 'error',
                    duration_ms: Math.round(performance.now() - startedAt),
                    metadata: { db_path: dbPath, error: (err as Error).message },
                });
            } finally {
                setDbLoading(false);
            }
        },
        [nodes, edges, setNodes, setEdges, fitView, toast],
    );

    const applyLayout = useCallback(
        async (mode: typeof layoutMode) => {
            if (nodes.length === 0) return;
            const startedAt = performance.now();
            void trackRuntimeEvent({
                event_type: 'layout',
                command: `layout-${mode}`,
                status: 'started',
            });
            setIsLayouting(true);
            try {
                const res = await fetch(`${BACKEND_URL}/advanced/layout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nodes, edges, layout: mode }),
                });
                if (!res.ok) throw new Error(`Layout failed: ${res.status}`);
                const data = await res.json();
                setNodes(data.nodes);
                setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 100);
                toast.success('Layout applied', mode);
                void trackRuntimeEvent({
                    event_type: 'layout',
                    command: `layout-${mode}`,
                    status: 'success',
                    duration_ms: Math.round(performance.now() - startedAt),
                    metadata: { engine: 'backend' },
                });
            } catch {
                const laidOut = applyClientLayout(nodes as any, edges, mode);
                setNodes(laidOut as any);
                setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 100);
                toast.success('Layout applied (client)', mode);
                void trackRuntimeEvent({
                    event_type: 'layout',
                    command: `layout-${mode}`,
                    status: 'success',
                    duration_ms: Math.round(performance.now() - startedAt),
                    metadata: { engine: 'client-fallback' },
                });
            } finally {
                setIsLayouting(false);
            }
        },
        [nodes, edges, setNodes, fitView, toast],
    );

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            if (!type || !reactFlowWrapper.current) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = {
                id: `${type}-${Date.now()}`,
                type,
                position,
                data: {
                    label: `New${type.charAt(0).toUpperCase() + type.slice(1)}`,
                },
            };
            addNode(newNode);
        },
        [screenToFlowPosition, addNode]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const projectName = location.state?.projectName || 'Untitled';
    const framework = location.state?.framework;
    const currentModel = location.state?.model || '';

    const commands: Command[] = useMemo(() => [
        {
            id: 'nav-home',
            label: 'Go to Home',
            section: 'Navigation',
            icon: commandIcons.home,
            shortcut: ['Esc'],
            keywords: ['back', 'return', 'landing', 'start'],
            action: () => navigate('/'),
        },
        {
            id: 'action-search',
            label: 'Find node in graph',
            description: 'Search by name, type, or file path',
            section: 'Navigation',
            icon: commandIcons.layers,
            shortcut: ['⌘', 'F'],
            keywords: ['search', 'filter', 'find', 'locate', 'node'],
            action: () => setIsSearchOpen(true),
        },
        {
            id: 'action-reanalyze',
            label: 'Re-analyze project',
            description: 'Parse all Python files and rebuild the graph',
            section: 'Actions',
            icon: commandIcons.refresh,
            shortcut: ['⌘', 'R'],
            keywords: ['parse', 'rebuild', 'refresh', 'scan', 'reload'],
            action: runAnalysis,
        },
        {
            id: 'action-brain',
            label: 'Open AI Brain',
            description: 'Complexity analysis and smart descriptions',
            section: 'Actions',
            icon: commandIcons.brain,
            shortcut: ['⌘', 'B'],
            keywords: ['ai', 'intelligence', 'analyze', 'complexity', 'describe'],
            action: () => setIsBrainOpen(true),
        },
        {
            id: 'action-export',
            label: 'Export Architecture as AI Prompt',
            description: 'Generate prompt for code generation',
            section: 'Actions',
            icon: commandIcons.download,
            shortcut: ['⌘', 'E'],
            keywords: ['export', 'prompt', 'codegen', 'generate', 'architecture'],
            action: () => setIsExportModalOpen(true),
        },
        {
            id: 'action-export-svg',
            label: 'Download graph as SVG',
            description: 'Export the current canvas as a scalable vector image',
            section: 'Export',
            icon: commandIcons.download,
            keywords: ['svg', 'vector', 'image', 'download', 'save'],
            action: () => {
                const ok = exportGraphAsSvg(`archy-${projectName}.svg`);
                if (!ok) console.warn('SVG export failed');
            },
        },
        {
            id: 'action-export-png',
            label: 'Download graph as PNG',
            description: 'Export the current canvas as a 2x PNG image',
            section: 'Export',
            icon: commandIcons.download,
            keywords: ['png', 'image', 'picture', 'download', 'save', 'screenshot'],
            action: () => {
                exportGraphAsPng(`archy-${projectName}.png`).catch((err) =>
                    console.warn('PNG export failed', err),
                );
            },
        },
        {
            id: 'action-export-json',
            label: 'Download graph as JSON',
            description: 'Export nodes + edges + metadata for scripting',
            section: 'Export',
            icon: commandIcons.download,
            keywords: ['json', 'data', 'export', 'metadata', 'scripting'],
            action: () => {
                exportGraphAsJson(
                    nodes,
                    edges,
                    {
                        project: projectName,
                        framework,
                        model: currentModel,
                        loaded_db: loadedDbPath,
                    },
                    `archy-${projectName}.json`,
                );
            },
        },
        {
            id: 'action-insights',
            label: showInsightsPanel ? 'Hide Insights Panel' : 'Show Insights Panel',
            description: 'Circular deps, smells, and complexity hotspots',
            section: 'View',
            icon: commandIcons.warning,
            shortcut: ['⌘', 'I'],
            keywords: ['insights', 'smells', 'circular', 'complexity', 'health', 'issues'],
            action: () => setShowInsightsPanel((v) => !v),
        },
        {
            id: 'action-env',
            label: 'View Environment Variables',
            description: 'Detect and display .env files securely',
            section: 'Actions',
            icon: commandIcons.layers,
            keywords: ['env', 'environment', 'variables', 'dotenv', 'secret', 'config'],
            action: () => setIsEnvPanelOpen(true),
        },
        {
            id: 'view-fit',
            label: 'Fit graph to viewport',
            section: 'View',
            icon: commandIcons.layers,
            shortcut: ['F'],
            keywords: ['fit', 'zoom', 'reset', 'viewport', 'center'],
            action: () => fitView({ padding: 0.2, duration: 400 }),
        },
        {
            id: 'view-toggle-sidebar',
            label: sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar',
            description: 'Toggle the explorer sidebar panel',
            section: 'View',
            icon: commandIcons.layers,
            keywords: ['sidebar', 'explorer', 'panel', 'toggle', 'collapse', 'expand'],
            action: () => setSidebarCollapsed(v => !v),
        },
        {
            id: 'canvas-add-note',
            label: 'Add canvas note card',
            description: 'Obsidian-style note on the graph',
            section: 'Canvas',
            icon: commandIcons.layers,
            keywords: ['note', 'sticky', 'card', 'obsidian', 'annotation'],
            action: addCanvasNote,
        },
        {
            id: 'canvas-remove-selected',
            label: 'Remove selected nodes',
            description: 'Delete from canvas (edges cleaned up)',
            section: 'Canvas',
            icon: commandIcons.layers,
            keywords: ['remove', 'delete', 'trash', 'clear'],
            action: () => removeSelectedNodes(),
        },
        {
            id: 'nav-focus-models',
            label: 'Focus: Data Layer',
            description: 'Zoom to model and schema nodes',
            section: 'Navigate',
            icon: commandIcons.database,
            keywords: ['layer', 'model', 'schema', 'data', 'focus', 'navigate'],
            action: () => {
                const dataNodes = nodes.filter(n => ['model', 'schema'].includes(n.type || ''));
                if (dataNodes.length > 0) {
                    fitView({ nodes: dataNodes, padding: 0.3, duration: 600 });
                }
            },
        },
        {
            id: 'nav-focus-api',
            label: 'Focus: API Layer',
            description: 'Zoom to route and controller nodes',
            section: 'Navigate',
            icon: commandIcons.network,
            keywords: ['layer', 'api', 'route', 'controller', 'endpoint', 'focus'],
            action: () => {
                const apiNodes = nodes.filter(n => ['route', 'controller'].includes(n.type || ''));
                if (apiNodes.length > 0) {
                    fitView({ nodes: apiNodes, padding: 0.3, duration: 600 });
                }
            },
        },
        {
            id: 'nav-focus-services',
            label: 'Focus: Service Layer',
            description: 'Zoom to service and domain nodes',
            section: 'Navigate',
            icon: commandIcons.zap,
            keywords: ['layer', 'service', 'domain', 'business', 'logic', 'focus'],
            action: () => {
                const svcNodes = nodes.filter(n => ['service', 'domain'].includes(n.type || ''));
                if (svcNodes.length > 0) {
                    fitView({ nodes: svcNodes, padding: 0.3, duration: 600 });
                }
            },
        },
        {
            id: 'action-security',
            label: 'Run Security Scan',
            description: 'Detect exposed secrets, unsafe configs, injection risks',
            section: 'Actions',
            icon: commandIcons.layers,
            keywords: ['security', 'scan', 'vulnerability', 'secret', 'exploit', 'audit'],
            action: () => setIsSecurityOpen(true),
        },
    ], [navigate, runAnalysis, fitView, showInsightsPanel, projectName, framework, currentModel, loadedDbPath, nodes, edges, addCanvasNote, removeSelectedNodes, sidebarCollapsed]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === 'k') {
                e.preventDefault();
                setIsCmdKOpen(true);
            } else if (mod && e.key === 'f') {
                e.preventDefault();
                setIsSearchOpen(true);
            } else if (e.key === '/' && !(e.target as HTMLElement)?.matches('input,textarea')) {
                e.preventDefault();
                setIsSearchOpen(true);
            } else if (mod && e.key === 'r') {
                e.preventDefault();
                runAnalysis();
            } else if (mod && e.key === 'b') {
                e.preventDefault();
                setIsBrainOpen((v) => !v);
            } else if (mod && e.key === 'e') {
                e.preventDefault();
                setIsExportModalOpen(true);
            } else if (mod && e.key === 'i') {
                e.preventDefault();
                setShowInsightsPanel((v) => !v);
            } else if (e.key === 'Escape') {
                if (selectedFile) setSelectedFile(null);
                else if (showInsightsPanel) setShowInsightsPanel(false);
            } else if (e.key === 'f' && !(e.target as HTMLElement)?.matches('input,textarea')) {
                fitView({ padding: 0.2, duration: 400 });
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [runAnalysis, fitView, selectedFile, showInsightsPanel]);

    const fileCount = location.state?.files?.length || 0;

    const trace = useTrace(nodes, edges, traceSource, traceDirection);

    const { displayNodes, displayEdges } = useMemo(() => {
        let filteredNodes = nodes;
        let filteredEdges = edges;

        if (hiddenTypes.size > 0) {
            const visibleIds = new Set(
                filteredNodes.filter(n => !hiddenTypes.has(n.type || '')).map(n => n.id),
            );
            filteredNodes = filteredNodes.filter(n => visibleIds.has(n.id));
            filteredEdges = filteredEdges.filter(
                e => visibleIds.has(e.source) && visibleIds.has(e.target),
            );
        }

        if (!trace) {
            return { displayNodes: filteredNodes, displayEdges: filteredEdges };
        }
        const { nodeIds, edgeIds } = trace;
        const traceAccent = 'var(--color-accent)';

        const styledNodes = filteredNodes.map((n) => {
            const inTrace = nodeIds.has(n.id);
            const isSource = n.id === traceSource;
            return {
                ...n,
                style: {
                    ...(n.style || {}),
                    opacity: inTrace ? 1 : 0.18,
                    filter: isSource ? `drop-shadow(0 0 8px ${traceAccent})` : undefined,
                    transition: 'opacity 200ms, filter 200ms',
                },
            };
        });

        const styledEdges = filteredEdges.map((e) => {
            const inTrace = edgeIds.has(e.id);
            return {
                ...e,
                style: {
                    ...(e.style || {}),
                    opacity: inTrace ? 1 : 0.08,
                    strokeWidth: inTrace ? ((e.style as any)?.strokeWidth || 1.5) + 0.8 : (e.style as any)?.strokeWidth,
                    transition: 'opacity 200ms',
                },
                animated: inTrace ? true : e.animated,
            };
        });

        return { displayNodes: styledNodes, displayEdges: styledEdges };
    }, [nodes, edges, trace, traceSource, hiddenTypes]);

    const traceChain = useMemo(
        () => (trace ? describeTrace(trace, nodes) : null),
        [trace, nodes],
    );

    const smellCount = insights?.architecture_smells.length || 0;
    const circularCount = insights?.circular_dependencies.length || 0;
    const orphanCount = insights?.orphan_files.length || 0;
    const hasIssues = smellCount + circularCount + orphanCount > 0;

    return (
        <div className="flex flex-col h-screen w-full" style={{ background: 'var(--color-bg)' }}>
            {/* Top Bar */}
            <nav
                className="shrink-0 border-b px-3 py-2 md:px-4"
                style={{
                    borderColor: 'var(--color-border)',
                    background: 'rgba(10, 10, 15, 0.92)',
                    backdropFilter: 'blur(8px)',
                }}
            >
                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <button
                                onClick={() => navigate('/')}
                                className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/5 transition-colors"
                                title="Back to home"
                            >
                                <Logo size={22} />
                                <ArrowLeft className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                            </button>

                            <span className="text-[var(--color-text-faint)]">/</span>

                            <span className="max-w-[140px] truncate text-[13px] font-medium sm:max-w-[220px] md:max-w-[300px]">
                                {projectName}
                            </span>

                            {framework && (
                                <>
                                    <span className="text-[var(--color-text-faint)]">/</span>
                                    <span
                                        className="mono-label flex items-center gap-1"
                                        title={
                                            location.state?.frameworkSignals
                                                ? (location.state.frameworkSignals as string[]).join(' · ')
                                                : undefined
                                        }
                                    >
                                        {framework}
                                        {typeof location.state?.frameworkConfidence === 'number' && (
                                            <span
                                                className="text-[9px] px-1 py-0.5 rounded"
                                                style={{
                                                    background:
                                                        location.state.frameworkConfidence > 0.7
                                                            ? 'rgba(16,185,129,0.15)'
                                                            : location.state.frameworkConfidence > 0.4
                                                            ? 'rgba(251,191,36,0.15)'
                                                            : 'rgba(239,68,68,0.15)',
                                                    color:
                                                        location.state.frameworkConfidence > 0.7
                                                            ? '#10b981'
                                                            : location.state.frameworkConfidence > 0.4
                                                            ? '#fbbf24'
                                                            : '#f87171',
                                                }}
                                            >
                                                {Math.round(location.state.frameworkConfidence * 100)}%
                                            </span>
                                        )}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                            <button
                                onClick={() => setIsRuntimeOpen(true)}
                                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] transition-colors hover:bg-white/5"
                                style={{
                                    color: isRuntimeOpen ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                    border: '1px solid var(--color-border-strong)',
                                    background: isRuntimeOpen ? 'rgba(124,134,255,0.08)' : undefined,
                                }}
                                title="Runtime and terminal insights"
                            >
                                <TerminalSquare className="w-3.5 h-3.5" />
                                <span>Runtime</span>
                            </button>

                            <button
                                onClick={() => toggleDevPanel('terminal')}
                                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] transition-colors hover:bg-white/5"
                                style={{
                                    color: devPanel === 'terminal' ? '#4ade80' : 'var(--color-text-muted)',
                                    border: '1px solid var(--color-border-strong)',
                                    background: devPanel === 'terminal' ? 'rgba(74,222,128,0.08)' : undefined,
                                }}
                                title="Activity Log — backend events"
                            >
                                <TerminalSquare className="w-3.5 h-3.5" />
                                <span>Logs</span>
                            </button>

                            <button
                                onClick={() => toggleDevPanel('http')}
                                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] transition-colors hover:bg-white/5"
                                style={{
                                    color: devPanel === 'http' ? '#60a5fa' : 'var(--color-text-muted)',
                                    border: '1px solid var(--color-border-strong)',
                                    background: devPanel === 'http' ? 'rgba(96,165,250,0.08)' : undefined,
                                }}
                                title="HTTP Tester — Postman-lite"
                            >
                                <Globe className="w-3.5 h-3.5" />
                                <span>HTTP</span>
                            </button>

                            <button
                                onClick={() => setIsExportModalOpen(true)}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
                                style={{
                                    background: 'var(--color-accent)',
                                    color: 'white',
                                    boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 6px 20px rgba(124,134,255,0.28)',
                                }}
                            >
                                <Wand2 className="w-3.5 h-3.5" />
                                <span>Export</span>
                            </button>
                        </div>
                    </div>

                    <div
                        className="rounded-xl border px-1.5 py-1"
                        style={{
                            borderColor: 'var(--color-border-strong)',
                            background: 'rgba(19, 19, 26, 0.75)',
                        }}
                    >
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={() => setIsSearchOpen(true)}
                                className="flex items-center gap-2 px-3 py-1 rounded-md text-[12px] border transition-colors hover:bg-white/5"
                                style={{
                                    borderColor: 'var(--color-border-strong)',
                                    color: 'var(--color-text-muted)',
                                }}
                                title="Find a node (⌘F or /)"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.2-5.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg>
                                <span>Find</span>
                                <span className="kbd ml-1">/</span>
                            </button>

                            <button
                                onClick={() => setIsCmdKOpen(true)}
                                className="flex items-center gap-2 px-3 py-1 rounded-md text-[12px] border transition-colors hover:bg-white/5"
                                style={{
                                    borderColor: 'var(--color-border-strong)',
                                    color: 'var(--color-text-muted)',
                                }}
                            >
                                <CommandIcon className="w-3.5 h-3.5" />
                                <span>Commands</span>
                                <span className="kbd ml-1">⌘K</span>
                            </button>

                            <button
                                onClick={runAnalysis}
                                disabled={isAnalyzing}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors disabled:opacity-50"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                                {isAnalyzing ? 'Analyzing' : 'Re-analyze'}
                            </button>

                            <LayoutPicker
                                value={layoutMode}
                                loading={isLayouting}
                                onChange={(m) => { setLayoutMode(m); applyLayout(m); }}
                            />

                            <button
                                onClick={() => setShowFilterPanel(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{
                                    color: hiddenTypes.size > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                    background: showFilterPanel ? 'rgba(255,255,255,0.05)' : undefined,
                                }}
                                title="Filter node types"
                            >
                                <Filter className="w-3.5 h-3.5" />
                                <span>Filter</span>
                                {hiddenTypes.size > 0 && (
                                    <span className="text-[9px] font-mono px-1 rounded" style={{ background: 'var(--color-accent-dim)' }}>
                                        {hiddenTypes.size}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setExcludeMigrations((v) => !v)}
                                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] transition-colors hover:bg-white/5"
                                style={{
                                    color: excludeMigrations ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                    background: excludeMigrations ? 'rgba(124,134,255,0.08)' : undefined,
                                }}
                                title={
                                    excludeMigrations
                                        ? 'Django migrations are omitted (cleaner graph). Toggle off, then Re-analyze to include them.'
                                        : 'Migrations will be included. Toggle on, then Re-analyze to omit them.'
                                }
                            >
                                <GitBranch className="h-3.5 w-3.5" />
                                <span>{excludeMigrations ? 'Skip migrations' : 'Include migrations'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => removeSelectedNodes()}
                                disabled={!nodes.some((n) => n.selected)}
                                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                                style={{ color: 'var(--color-text-muted)' }}
                                title="Remove selected nodes from the canvas (Del / Backspace)"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Remove</span>
                            </button>

                            {(dbCandidates.length > 0 || dbConnections.length > 0) && (
                                <DatabaseButton
                                    candidates={dbCandidates}
                                    connections={dbConnections}
                                    loadedPath={loadedDbPath}
                                    loading={dbLoading}
                                    error={dbError}
                                    onLoad={loadDatabase}
                                />
                            )}

                            <button
                                onClick={() => setIsBrainOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <Brain className="w-3.5 h-3.5" />
                                AI Brain
                            </button>

                            <button
                                onClick={() => setIsEnvPanelOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isEnvPanelOpen ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                                title="View environment variables (.env files)"
                            >
                                <Shield className="w-3.5 h-3.5" />
                                .env
                            </button>

                            <button
                                onClick={() => setIsSecurityOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isSecurityOpen ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                                title="Security analysis"
                            >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Security
                            </button>

                            <button
                                onClick={() => setIsArchDoctorOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isArchDoctorOpen ? '#a78bfa' : 'var(--color-text-muted)' }}
                                title="Architecture Doctor — AI health scan"
                            >
                                <Stethoscope className="w-3.5 h-3.5" />
                                Doctor
                            </button>

                            <HealthPill data={healthData} onClick={() => setIsHealthOpen(true)} />

                            <button
                                onClick={() => setIsMCPOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isMCPOpen ? '#60a5fa' : 'var(--color-text-muted)' }}
                                title="MCP Server settings"
                            >
                                <Server className="w-3.5 h-3.5" />
                                MCP
                            </button>

                            <button
                                onClick={() => setIsOnboardingOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isOnboardingOpen ? '#fbbf24' : 'var(--color-text-muted)' }}
                                title="Onboarding — AI-generated project tour"
                            >
                                <BookOpen className="w-3.5 h-3.5" />
                                Onboard
                            </button>

                            <button
                                onClick={() => setIsDiffOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isDiffOpen || activeDiff ? '#06b6d4' : 'var(--color-text-muted)' }}
                                title="Architecture Diff — compare snapshots"
                            >
                                <GitCompare className="w-3.5 h-3.5" />
                                Diff
                            </button>

                            <button
                                onClick={() => setIsTraceOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors"
                                style={{ color: isTraceOpen ? '#fb923c' : 'var(--color-text-muted)' }}
                                title="Runtime Trace — execution heat map"
                            >
                                <Activity className="w-3.5 h-3.5" />
                                Trace
                            </button>

                            <SecurityBadge count={securityIssueCount} onClick={() => setIsGraphSecurityOpen(true)} />
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main content area */}
            <div className="flex flex-1 min-h-0">
                {/* Collapsible sidebar wrapper */}
                <div
                    className="relative shrink-0 border-r transition-[width] duration-300 ease-in-out overflow-hidden"
                    style={{
                        width: sidebarCollapsed ? 0 : '24rem',
                        borderColor: sidebarCollapsed ? 'transparent' : 'var(--color-border)',
                    }}
                >
                    <div className="h-full" style={{ width: '24rem' }}>
                        <Sidebar 
                            files={location.state?.files} 
                            projectPath={location.state?.projectPath}
                            onFileSelect={setSelectedFile}
                            collapsed={sidebarCollapsed}
                        />
                    </div>
                </div>

                {/* Sidebar toggle tab */}
                <button
                    onClick={() => setSidebarCollapsed(v => !v)}
                    className="relative z-10 flex h-8 w-6 items-center justify-center self-center -ml-px rounded-r-md border border-l-0 transition-colors hover:bg-white/5"
                    style={{
                        background: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-muted)',
                    }}
                    title={sidebarCollapsed ? 'Show explorer (sidebar)' : 'Hide explorer (sidebar)'}
                >
                    {sidebarCollapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
                </button>

                <div className="flex-1 flex flex-col min-w-0">
                    {/* Canvas */}
                    <div ref={reactFlowWrapper} className="flex-1 relative crosshair-grid">
                        {showFilterPanel && (
                            <NodeFilterPanel
                                nodes={nodes}
                                hiddenTypes={hiddenTypes}
                                onChange={setHiddenTypes}
                                onClose={() => setShowFilterPanel(false)}
                            />
                        )}
                        {/* Loading overlay */}
                        {isAnalyzing && nodes.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <div className="surface-elevated px-6 py-4 flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full border-2 animate-spin" 
                                         style={{ borderColor: 'var(--color-border-strong)', borderTopColor: 'var(--color-accent)' }} />
                                    <div>
                                        <div className="text-[13px] font-medium">Parsing Python AST</div>
                                        <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                            Reading {fileCount} files and building dependency graph...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {!isAnalyzing && nodes.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center">
                                    <FileCode className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <div className="text-[14px] font-medium mb-1">No architecture yet</div>
                                    <div className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                                        Open a project or drag nodes from the sidebar
                                    </div>
                                </div>
                            </div>
                        )}

                        <ReactFlow
                            nodes={displayNodes}
                            edges={displayEdges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onNodeClick={(evt, node) => {
                                if (evt.altKey) {
                                    setTraceSource((prev) => (prev === node.id ? null : node.id));
                                    return;
                                }
                            }}
                            onNodeDoubleClick={(_evt, node) => {
                                const fp = (node.data as any)?.filepath;
                                if (fp) {
                                    setEditorFile(fp);
                                    setEditorScrollLine((node.data as any)?.line_number);
                                }
                            }}
                            onPaneClick={() => {
                                if (traceSource) setTraceSource(null);
                            }}
                            nodeTypes={nodeTypes}
                            deleteKeyCode={['Delete', 'Backspace']}
                            onlyRenderVisibleElements={nodes.length > 80}
                            connectionLineType={ConnectionLineType.Bezier}
                            defaultEdgeOptions={{
                                type: 'default',
                                style: { strokeWidth: 1.65, stroke: 'rgba(255,255,255,0.4)' },
                                markerEnd: {
                                    type: MarkerType.ArrowClosed,
                                    width: 9,
                                    height: 9,
                                    color: 'rgba(255,255,255,0.45)',
                                },
                            }}
                            minZoom={0.05}
                            maxZoom={4}
                            snapToGrid={false}
                            panOnDrag={[1, 2]}
                            selectionOnDrag={false}
                            zoomOnScroll
                            zoomOnPinch
                            panOnScroll={false}
                            fitView
                            fitViewOptions={{ padding: 0.15, duration: 600 }}
                            attributionPosition="bottom-right"
                            proOptions={{ hideAttribution: true }}
                            className="!bg-transparent [&_.react-flow__attribution]:hidden"
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                color="rgba(255, 255, 255, 0.04)"
                                gap={28}
                                size={1}
                            />
                            <Controls
                                showInteractive={false}
                                className="!bg-[var(--color-surface)] !border-[var(--color-border-strong)] !rounded-lg !shadow-lg"
                            />
                            <MiniMap
                                nodeColor={(node) => getNodeConfig(node.type || 'utility').color}
                                maskColor="rgba(10, 10, 15, 0.7)"
                                className="!bg-[var(--color-surface)] !border !border-[var(--color-border-strong)] !rounded-lg"
                                style={{ background: 'var(--color-surface)' }}
                            />
                        </ReactFlow>

                        {/* Insights Panel (overlay, slide-in from right) */}
                        {showInsightsPanel && insights && !selectedFile && (
                            <InsightsPanel 
                                insights={insights} 
                                metrics={metrics}
                                onClose={() => setShowInsightsPanel(false)} 
                            />
                        )}
                        
                        {/* File Detail Panel (on node click) */}
                        {selectedFile && (
                            <FileDetailPanel
                                filepath={selectedFile}
                                projectPath={location.state?.projectPath || ''}
                                framework={framework}
                                allFiles={location.state?.files || []}
                                aiModel={location.state?.model || ''}
                                onClose={() => setSelectedFile(null)}
                                onOpenInEditor={async () => {
                                    if (openEditorInFlightRef.current) {
                                        return;
                                    }

                                    openEditorInFlightRef.current = true;
                                    const rawProject = location.state?.projectPath || '';
                                    if (!rawProject) {
                                        toast.error('Editor', 'Project path unavailable. Re-open the project from the homepage.');
                                        openEditorInFlightRef.current = false;
                                        return;
                                    }
                                    const startedAt = performance.now();
                                    try {
                                        const res = await fetch(`${BACKEND_URL}/editor/open`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                filepath: selectedFile,
                                                project_root: rawProject,
                                                editor: 'code',
                                            }),
                                        });
                                        if (res.ok) {
                                            toast.success('Opened in VS Code', selectedFile.split('/').pop() || selectedFile);
                                            void trackRuntimeEvent({
                                                event_type: 'editor',
                                                command: 'open-file',
                                                status: 'success',
                                                duration_ms: Math.round(performance.now() - startedAt),
                                                metadata: { filepath: selectedFile },
                                            });
                                            return;
                                        }
                                        const errorPayload = await res.json().catch(() => ({}));
                                        throw new Error(errorPayload?.detail || `HTTP ${res.status}`);
                                    } catch (err) {
                                        void trackRuntimeEvent({
                                            event_type: 'editor',
                                            command: 'open-file',
                                            status: 'error',
                                            duration_ms: Math.round(performance.now() - startedAt),
                                            metadata: { filepath: selectedFile, error: (err as Error).message },
                                        });
                                        toast.error('Could not open in VS Code', (err as Error).message || 'Ensure VS Code is installed and "code" is on your PATH.');
                                    } finally {
                                        openEditorInFlightRef.current = false;
                                    }
                                }}
                            />
                        )}

                        {/* Data Flow Trace overlay */}
                        <CanvasFloatingDock
                            onAddNote={addCanvasNote}
                            onFitView={() => fitView({ padding: 0.2, duration: 400 })}
                        />

                        {/* Architecture Health Badge — floating top-left on canvas */}
                        {nodes.length > 0 && insights && (
                            <ArchitectureHealthBadge
                                insights={insights}
                                nodeCount={nodes.length}
                                edgeCount={edges.length}
                                onClick={() => setShowInsightsPanel(true)}
                            />
                        )}

                        {/* Dependency Impact Preview — shown for selected node */}
                        <DependencyImpactPreview
                            nodes={nodes}
                            edges={edges}
                        />

                        {trace && traceSource && (
                            <TraceOverlay
                                sourceNode={displayNodes.find((n) => n.id === traceSource)}
                                direction={traceDirection}
                                onDirectionChange={setTraceDirection}
                                onClear={() => setTraceSource(null)}
                                nodeCount={trace.nodeIds.size}
                                edgeCount={trace.edgeIds.size}
                                depthCount={trace.depthLevels.length - 1}
                                chain={traceChain}
                            />
                        )}

                        {/* Trace hint bubble (shown briefly when no trace) */}
                        {!trace && nodes.length > 0 && !selectedFile && (
                            <div
                                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-[10px] font-mono pointer-events-none"
                                style={{
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(8px)',
                                    color: 'var(--color-text-muted)',
                                    border: '1px solid var(--color-border)',
                                }}
                            >
                                <span className="kbd mr-1">Alt</span>+click trace · double-click to inspect · <span className="kbd">Del</span> remove
                            </div>
                        )}
                    </div>

                    {/* Developer Tools Bottom Panel */}
                    {devPanel && (
                        <div
                            className="shrink-0 border-t"
                            style={{
                                height: devPanel === 'http' ? 340 : 240,
                                borderColor: 'var(--color-border)',
                            }}
                        >
                            {devPanel === 'terminal' && (
                                <TerminalPanel isOpen={true} onClose={() => setDevPanel(null)} />
                            )}
                            {devPanel === 'http' && (
                                <HTTPRequestPanel isOpen={true} onClose={() => setDevPanel(null)} />
                            )}
                        </div>
                    )}

                    {/* Status Bar */}
                    <div className="status-bar shrink-0">
                        <span className="status-bar-item">
                            <Activity className="w-3 h-3" />
                            {isAnalyzing ? 'analyzing' : analysisError ? 'error' : 'ready'}
                        </span>
                        <span className="status-bar-item">
                            <GitBranch className="w-3 h-3" />
                            {nodes.length} nodes · {edges.length} edges
                        </span>
                        {metrics && (
                            <>
                                <span className="status-bar-item">
                                    {metrics.total_classes} classes
                                </span>
                                <span className="status-bar-item">
                                    {metrics.total_routes} routes
                                </span>
                                <span className="status-bar-item">
                                    cx {metrics.average_complexity}
                                </span>
                            </>
                        )}
                        <div className="flex-1" />
                        {hasIssues && (
                            <button
                                onClick={() => setShowInsightsPanel(true)}
                                className="status-bar-item"
                                style={{ color: 'var(--color-warning)' }}
                            >
                                <AlertTriangle className="w-3 h-3" />
                                {smellCount + circularCount} issues
                            </button>
                        )}
                        {currentModel ? (
                            <span className="status-bar-item" title={`AI model: ${currentModel}`}>
                                <Brain className="w-3 h-3" style={{ color: 'var(--color-accent)' }} />
                                <span>{currentModel.split('/').pop()?.replace(':free', '')}</span>
                            </span>
                        ) : (
                            <span className="status-bar-item" title="AI disabled — local analysis only">
                                <Brain className="w-3 h-3" style={{ color: 'var(--color-text-faint)' }} />
                                <span>AI off</span>
                            </span>
                        )}
                        <span className="status-bar-item">
                            <Zap className="w-3 h-3" />
                            <span>Py AST</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* AI Brain Panel */}
            <AIBrainPanel
                isOpen={isBrainOpen}
                onClose={() => setIsBrainOpen(false)}
                files={location.state?.files || []}
            />

            {/* Environment Variables Panel */}
            <EnvPanel
                isOpen={isEnvPanelOpen}
                onClose={() => setIsEnvPanelOpen(false)}
                files={location.state?.files || []}
            />

            {/* Security Panel */}
            <SecurityPanel
                isOpen={isSecurityOpen}
                onClose={() => setIsSecurityOpen(false)}
                files={location.state?.files || []}
                framework={framework}
            />

            {/* Architecture Doctor Panel */}
            <ArchDoctorPanel
                isOpen={isArchDoctorOpen}
                onClose={() => setIsArchDoctorOpen(false)}
                nodes={nodes}
                edges={edges}
                metrics={metrics}
                framework={framework}
                model={currentModel ?? undefined}
            />

            <RuntimeInsightsPanel
                isOpen={isRuntimeOpen}
                onClose={() => setIsRuntimeOpen(false)}
                framework={framework}
                nodeCount={nodes.length}
                edgeCount={edges.length}
                fileCount={location.state?.files?.length}
            />

            {/* Health Score Panel */}
            <HealthScorePanel
                isOpen={isHealthOpen}
                onClose={() => setIsHealthOpen(false)}
                data={healthData}
                onNodeClick={(filepath) => { setSelectedFile(filepath); setIsHealthOpen(false); }}
            />

            {/* Export Architecture Modal */}
            <ExportArchitectureModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                files={location.state?.files || []}
                insights={insights}
                metrics={metrics}
            />

            {/* Command Palette */}
            <CommandPalette
                isOpen={isCmdKOpen}
                onClose={() => setIsCmdKOpen(false)}
                commands={commands}
            />

            {/* Graph Search (Cmd+F) */}
            <GraphSearch
                isOpen={isSearchOpen}
                nodes={nodes}
                onClose={() => setIsSearchOpen(false)}
                onSelect={(id) => {
                    focusNode(id);
                    const node = getNode(id);
                    const fp = (node?.data as any)?.filepath;
                    if (fp) setSelectedFile(fp);
                }}
                onTrace={(id) => {
                    focusNode(id);
                    setTraceSource(id);
                }}
            />

            {/* MCP Settings Panel */}
            <MCPSettingsPanel isOpen={isMCPOpen} onClose={() => setIsMCPOpen(false)} />

            {/* Graph Security Scanner */}
            <GraphSecurityPanel
                isOpen={isGraphSecurityOpen}
                onClose={() => setIsGraphSecurityOpen(false)}
                nodes={nodes}
                edges={edges}
                autoRun={nodes.length > 0}
                onHighlightNode={(nodeId) => {
                    focusNode(nodeId);
                    setIsGraphSecurityOpen(false);
                }}
                onOpenFile={(fp, line) => {
                    setEditorFile(fp);
                    setEditorScrollLine(line);
                    setIsGraphSecurityOpen(false);
                }}
            />

            {/* Trace Overlay Panel */}
            <TraceOverlayPanel
                isOpen={isTraceOpen}
                onClose={() => setIsTraceOpen(false)}
                projectPath={projectPath}
                nodes={nodes}
            />

            {/* Diff Panel */}
            <DiffPanel
                isOpen={isDiffOpen}
                onClose={() => setIsDiffOpen(false)}
                nodes={nodes}
                edges={edges}
                framework={framework}
                projectPath={projectPath}
                onDiffApply={setActiveDiff}
            />

            {/* Onboarding Panel */}
            <OnboardingPanel
                isOpen={isOnboardingOpen}
                onClose={() => setIsOnboardingOpen(false)}
                model={currentModel}
                nodes={nodes}
                edges={edges}
                framework={framework}
                projectPath={projectPath}
                onFocusNode={(name) => {
                    const node = nodes.find((n: any) =>
                        n.id === name ||
                        (n.data?.label || '').toLowerCase().includes(name.toLowerCase())
                    );
                    if (node) focusNode(node.id);
                }}
                onOpenFile={(fp) => { setEditorFile(fp); setIsOnboardingOpen(false); }}
            />

            {/* Canvas Editor (Monaco) — double-click a node to edit */}
            {editorFile && (
                <CanvasEditorPanel
                    filepath={editorFile}
                    projectPath={projectPath}
                    framework={framework}
                    model={currentModel}
                    onClose={() => { setEditorFile(null); setEditorScrollLine(undefined); }}
                    onFileSaved={() => runAnalysis()}
                    scrollToLine={editorScrollLine}
                />
            )}
        </div>
    );
}

function InsightsPanel({ 
    insights, 
    metrics,
    onClose 
}: { 
    insights: AnalysisResult['insights']; 
    metrics: AnalysisResult['metrics'] | null;
    onClose: () => void;
}) {
    const circularDeps = insights.circular_dependencies.length;
    const godClasses = insights.architecture_smells.filter(
        (s: any) => s.type === 'god_class',
    ).length;
    const orphanCount = insights.orphan_files.length;
    const hotspotCount = insights.high_complexity_files.length;
    const healthScore = Math.max(0, 100 - circularDeps * 5 - godClasses * 3 - orphanCount * 2 - hotspotCount * 1);
    const healthColor = healthScore >= 80 ? '#4ade80' : healthScore >= 60 ? '#fbbf24' : '#f87171';

    return (
        <div className="absolute top-4 right-4 bottom-16 w-[340px] flex flex-col z-20 overflow-hidden"
             style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 12 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                 style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                         style={{ background: 'rgba(99,102,241,0.15)' }}>
                        <Activity className="w-3.5 h-3.5" style={{ color: '#818cf8' }} />
                    </div>
                    <div>
                        <div className="mono-label">ARCHITECTURE</div>
                        <div className="text-[13px] font-semibold leading-tight">Insights</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Health score badge */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                         style={{ background: `${healthColor}15`, border: `1px solid ${healthColor}30` }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: healthColor }} />
                        <span className="text-[10px] font-mono font-semibold" style={{ color: healthColor }}>
                            {healthScore}%
                        </span>
                    </div>
                    <button onClick={onClose}
                            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors text-lg leading-none"
                            style={{ color: 'var(--color-text-muted)' }}>
                        ×
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                {/* Metrics summary */}
                {metrics && (
                    <div>
                        <div className="mono-label mb-2.5">METRICS</div>
                        <div className="grid grid-cols-3 gap-1.5">
                            <MetricCell label="Files" value={metrics.total_files} accent="#60a5fa" />
                            <MetricCell label="Classes" value={metrics.total_classes} accent="#a78bfa" />
                            <MetricCell label="Functions" value={metrics.total_functions} accent="#34d399" />
                            <MetricCell label="Lines" value={metrics.total_lines.toLocaleString()} accent="#fbbf24" />
                            <MetricCell label="Models" value={metrics.total_models} accent="#f87171" />
                            <MetricCell label="Routes" value={metrics.total_routes} accent="#22d3ee" />
                        </div>
                        {/* Complexity progress bar */}
                        <div className="mt-2.5 px-0.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Avg Complexity</span>
                                <span className="text-[10px] font-mono font-semibold"
                                      style={{ color: metrics.average_complexity > 5 ? '#f87171' : metrics.average_complexity > 3 ? '#fbbf24' : '#4ade80' }}>
                                    {metrics.average_complexity?.toFixed(1) ?? '—'}
                                </span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                <div className="h-full rounded-full transition-all"
                                     style={{
                                         width: `${Math.min(100, (metrics.average_complexity / 10) * 100)}%`,
                                         background: metrics.average_complexity > 5 ? '#f87171' : metrics.average_complexity > 3 ? '#fbbf24' : '#4ade80',
                                     }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Architecture smells */}
                {insights.architecture_smells.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <AlertTriangle className="w-3 h-3" style={{ color: '#fbbf24' }} />
                            <span className="mono-label" style={{ color: '#fbbf24' }}>SMELLS ({insights.architecture_smells.length})</span>
                        </div>
                        <div className="space-y-1.5">
                            {insights.architecture_smells.map((smell, i) => (
                                <div key={i} className="rounded-lg p-2.5"
                                     style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                                    <div className="text-[11px] font-semibold" style={{ color: '#fde68a' }}>{smell.type}</div>
                                    <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                                        {smell.location}
                                    </div>
                                    <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                                        {smell.suggestion}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Circular dependencies */}
                {insights.circular_dependencies.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <GitBranch className="w-3 h-3" style={{ color: '#f87171' }} />
                            <span className="mono-label" style={{ color: '#f87171' }}>CIRCULAR DEPS ({insights.circular_dependencies.length})</span>
                        </div>
                        <div className="space-y-1.5">
                            {insights.circular_dependencies.map((cycle, i) => (
                                <div key={i} className="rounded-lg p-2.5 font-mono text-[10px] break-all leading-relaxed"
                                     style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: '#fca5a5' }}>
                                    {cycle.join(' → ')}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* High complexity hotspots */}
                {insights.high_complexity_files.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Zap className="w-3 h-3" style={{ color: '#fb923c' }} />
                            <span className="mono-label">HOTSPOTS ({insights.high_complexity_files.length})</span>
                        </div>
                        <div className="space-y-1.5">
                            {insights.high_complexity_files.map((file, i) => {
                                const cx = file.complexity;
                                const bar = Math.min(100, (cx / 20) * 100);
                                return (
                                    <div key={i} className="rounded-lg p-2.5"
                                         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="font-mono text-[10px] truncate flex-1" style={{ color: 'var(--color-text-muted)' }}>
                                                {file.path.split('/').slice(-2).join('/')}
                                            </span>
                                            <span className="font-mono font-bold text-[12px] ml-2 flex-shrink-0"
                                                  style={{ color: cx > 15 ? '#f87171' : cx > 8 ? '#fbbf24' : '#4ade80' }}>
                                                cx {cx}
                                            </span>
                                        </div>
                                        <div className="h-1 rounded-full overflow-hidden mb-1.5"
                                             style={{ background: 'rgba(255,255,255,0.06)' }}>
                                            <div className="h-full rounded-full"
                                                 style={{ width: `${bar}%`, background: cx > 15 ? '#f87171' : cx > 8 ? '#fbbf24' : '#4ade80' }} />
                                        </div>
                                        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                                            {file.suggestion}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Orphan files */}
                {insights.orphan_files.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <FileCode className="w-3 h-3" style={{ color: '#94a3b8' }} />
                            <span className="mono-label">ORPHANS ({insights.orphan_files.length})</span>
                        </div>
                        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                            {insights.orphan_files.slice(0, 8).map((file, i) => (
                                <div key={i}
                                     className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono"
                                     style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', color: 'var(--color-text-muted)' }}>
                                    <span className="text-white/20">—</span>
                                    <span className="truncate">{file.split('/').slice(-2).join('/')}</span>
                                </div>
                            ))}
                            {insights.orphan_files.length > 8 && (
                                <div className="px-2.5 py-1.5 text-[10px] font-mono"
                                     style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'var(--color-text-faint)' }}>
                                    +{insights.orphan_files.length - 8} more orphaned files
                                </div>
                            )}
                        </div>
                        <div className="text-[10px] mt-1.5 italic" style={{ color: 'var(--color-text-faint)' }}>
                            Not imported anywhere — possible dead code
                        </div>
                    </div>
                )}

                {/* All clean */}
                {insights.architecture_smells.length === 0 && 
                 insights.circular_dependencies.length === 0 &&
                 insights.high_complexity_files.length === 0 && (
                    <div className="text-center py-10">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                             style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                            <span className="text-2xl">✓</span>
                        </div>
                        <div className="text-[14px] font-semibold mb-1" style={{ color: '#4ade80' }}>Clean architecture</div>
                        <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            No smells, circular deps, or hotspots detected
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Obsidian Canvas–style floating toolbar: add freeform note, fit view. */
function CanvasFloatingDock({
    onAddNote,
    onFitView,
}: {
    onAddNote: () => void;
    onFitView: () => void;
}) {
    return (
        <div
            className="pointer-events-auto absolute bottom-[3.25rem] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border px-1.5 py-1.5 shadow-2xl backdrop-blur-md"
            style={{
                background: 'rgba(19, 19, 26, 0.94)',
                borderColor: 'var(--color-border-strong)',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.55)',
            }}
        >
            <button
                type="button"
                onClick={onAddNote}
                className="flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-medium transition-colors hover:bg-white/10"
                style={{ color: 'var(--color-text)' }}
                title="Add a note card (like Obsidian Canvas)"
            >
                <StickyNote className="h-4 w-4" style={{ color: '#c4b5fd' }} />
                <span>Note</span>
            </button>
            <div className="mx-1 h-6 w-px shrink-0 bg-white/10" />
            <button
                type="button"
                onClick={onFitView}
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10"
                style={{ color: 'var(--color-text-muted)' }}
                title="Fit graph to viewport (F)"
            >
                <Maximize2 className="h-4 w-4" />
            </button>
        </div>
    );
}

function LayoutPicker({
    value,
    loading,
    onChange,
}: {
    value: 'hierarchical' | 'radial' | 'tree' | 'force' | 'hub';
    loading: boolean;
    onChange: (mode: 'hierarchical' | 'radial' | 'tree' | 'force' | 'hub') => void;
}) {
    const [open, setOpen] = useState(false);
    const LAYOUTS: { id: typeof value; label: string; desc: string }[] = [
        { id: 'hierarchical', label: 'Hierarchical', desc: 'Layered by node type' },
        { id: 'tree',         label: 'Tree',         desc: 'Top-down dependency tree' },
        { id: 'radial',       label: 'Radial',       desc: 'Concentric rings' },
        { id: 'force',        label: 'Force',        desc: 'Physics-based repulsion' },
        { id: 'hub',          label: 'Hub & spoke',  desc: 'Center + ring (canvas style)' },
    ];
    const current = LAYOUTS.find(l => l.id === value) || LAYOUTS[0];

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors disabled:opacity-50"
                style={{ color: 'var(--color-text-muted)' }}
                title="Change graph layout"
            >
                {loading ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="30 60" />
                    </svg>
                ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25"/>
                    </svg>
                )}
                <span>Layout</span>
                <span className="text-[10px] opacity-60 font-mono">{current.label}</span>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 surface-elevated z-20 min-w-[220px] overflow-hidden rounded-lg">
                        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                            <div className="mono-label">GRAPH LAYOUT</div>
                        </div>
                        {LAYOUTS.map(l => (
                            <button
                                key={l.id}
                                onClick={() => { onChange(l.id); setOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                            >
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: l.id === value ? 'var(--color-accent)' : 'var(--color-border-strong)' }}
                                />
                                <div>
                                    <div className="text-[12px] font-medium">{l.label}</div>
                                    <div className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{l.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function MetricCell({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
    return (
        <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {label}
            </div>
            <div className="text-[16px] font-semibold numeric mt-0.5" style={accent ? { color: accent } : {}}>
                {value}
            </div>
        </div>
    );
}

/**
 * Button + dropdown for loading SQLite databases found in the project.
 */
function DatabaseButton({
    candidates,
    connections,
    loadedPath,
    loading,
    error,
    onLoad,
}: {
    candidates: DBCandidate[];
    connections: import('@/services/databaseInspector').DBConnectionInfo[];
    loadedPath: string | null;
    loading: boolean;
    error: string | null;
    onLoad: (path: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const hasLoaded = !!loadedPath;
    const totalCount = candidates.length + connections.length;

    const DB_TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
        postgresql: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', icon: '🐘' },
        mysql:      { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', icon: '🐬' },
        mongodb:    { bg: 'rgba(74,222,128,0.15)', text: '#4ade80', icon: '🍃' },
        redis:      { bg: 'rgba(248,113,113,0.15)', text: '#f87171', icon: '⚡' },
        sqlite:     { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8', icon: '📦' },
        unknown:    { bg: 'rgba(255,255,255,0.08)', text: '#94a3b8', icon: '💾' },
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] hover:bg-white/5 transition-colors disabled:opacity-50"
                style={{ color: hasLoaded || connections.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                title={hasLoaded ? `Loaded: ${loadedPath}` : `${totalCount} database(s) detected`}
            >
                {loading ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="30 60" />
                    </svg>
                ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                        <path d="M3 12a9 3 0 0 0 18 0" />
                    </svg>
                )}
                <span>{hasLoaded ? 'DB loaded' : connections.length > 0 ? 'Databases' : 'Inspect DB'}</span>
                <span className="text-[9px] font-mono opacity-60">{totalCount}</span>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div
                        className="absolute right-0 top-full mt-1 surface-elevated z-20 min-w-[360px] overflow-hidden"
                        style={{ borderRadius: 8 }}
                    >
                        {/* Connection strings from .env */}
                        {connections.length > 0 && (
                            <>
                                <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                                    <div className="mono-label">DATABASE CONNECTIONS</div>
                                    <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        Detected from environment variables
                                    </div>
                                </div>
                                <div className="py-1">
                                    {connections.map((conn, i) => {
                                        const colors = DB_TYPE_COLORS[conn.type] || DB_TYPE_COLORS.unknown;
                                        return (
                                            <div
                                                key={i}
                                                className="flex items-start gap-2.5 px-3 py-2.5"
                                            >
                                                <div
                                                    className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-sm"
                                                    style={{ background: colors.bg }}
                                                >
                                                    {colors.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className="text-[11px] font-bold uppercase"
                                                            style={{ color: colors.text }}
                                                        >
                                                            {conn.type}
                                                        </span>
                                                        <span
                                                            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                                            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}
                                                        >
                                                            {conn.source}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5">
                                                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                                            host: <span style={{ color: 'var(--color-text)' }}>{conn.host}</span>
                                                        </span>
                                                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                                            port: <span style={{ color: 'var(--color-text)' }}>{conn.port}</span>
                                                        </span>
                                                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                                            user: <span style={{ color: 'var(--color-text)' }}>{conn.username || '—'}</span>
                                                        </span>
                                                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                                            db: <span style={{ color: 'var(--color-text)' }}>{conn.database || '—'}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* SQLite files */}
                        {candidates.length > 0 && (
                            <>
                                <div
                                    className="px-3 py-2 border-b"
                                    style={{ borderColor: 'var(--color-border)', borderTop: connections.length > 0 ? '1px solid var(--color-border)' : undefined }}
                                >
                                    <div className="mono-label">SQLITE DATABASES</div>
                                    <div
                                        className="text-[10px] font-mono mt-0.5"
                                        style={{ color: 'var(--color-text-muted)' }}
                                    >
                                        Click to merge live schema into the graph
                                    </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar py-1">
                                    {candidates.map((cand) => {
                                        const isLoaded = cand.path === loadedPath;
                                        return (
                                            <button
                                                key={cand.path}
                                                onClick={() => {
                                                    if (!isLoaded) onLoad(cand.path);
                                                    setOpen(false);
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                                            >
                                                <div
                                                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                                    style={{
                                                        background: isLoaded ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-bg-subtle)',
                                                        color: isLoaded ? '#10b981' : 'var(--color-text-muted)',
                                                    }}
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                                                        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--color-text)' }} title={cand.path}>
                                                        {cand.name}
                                                    </div>
                                                    <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                                                        {formatBytes(cand.size_bytes)} · {cand.path}
                                                    </div>
                                                </div>
                                                {isLoaded && (
                                                    <span
                                                        className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                                                        style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                                                    >
                                                        LOADED
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {error && (
                            <div
                                className="px-3 py-2 text-[11px] border-t"
                                style={{
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-danger)',
                                    background: 'rgba(239,68,68,0.06)',
                                }}
                            >
                                {error}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function NodeFilterPanel({
    nodes,
    hiddenTypes,
    onChange,
    onClose,
}: {
    nodes: any[];
    hiddenTypes: Set<string>;
    onChange: (s: Set<string>) => void;
    onClose: () => void;
}) {
    const typeCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const n of nodes) {
            const t = n.type || 'utility';
            m.set(t, (m.get(t) || 0) + 1);
        }
        return m;
    }, [nodes]);

    const presentTypes = NODE_TYPE_LIST.filter(t => typeCounts.has(t));
    const allVisible = hiddenTypes.size === 0;

    const toggle = (type: string) => {
        const next = new Set(hiddenTypes);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        onChange(next);
    };

    return (
        <div
            className="absolute top-3 right-3 z-30 surface-elevated min-w-[220px] overflow-hidden"
            style={{ borderRadius: 10 }}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
                    <span className="mono-label" style={{ color: 'var(--color-text)' }}>FILTER NODES</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => onChange(new Set())}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        All
                    </button>
                    <button
                        onClick={() => onChange(new Set(presentTypes))}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        None
                    </button>
                    <button
                        onClick={onClose}
                        className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/5 transition-colors text-base leading-none"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        ×
                    </button>
                </div>
            </div>
            <div className="py-1 max-h-[320px] overflow-y-auto custom-scrollbar">
                {presentTypes.map(type => {
                    const cfg = getNodeConfig(type);
                    const count = typeCounts.get(type) || 0;
                    const visible = !hiddenTypes.has(type);
                    return (
                        <button
                            key={type}
                            onClick={() => toggle(type)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 transition-colors text-left"
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ background: visible ? cfg.color : 'rgba(255,255,255,0.12)' }}
                            />
                            <span
                                className="flex-1 text-[12px]"
                                style={{ color: visible ? 'var(--color-text)' : 'var(--color-text-faint)' }}
                            >
                                {cfg.label}
                            </span>
                            <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                {count}
                            </span>
                            <div
                                className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
                                style={{
                                    borderColor: visible ? cfg.color : 'var(--color-border-strong)',
                                    background: visible ? `${cfg.color}20` : 'transparent',
                                }}
                            >
                                {visible && (
                                    <svg className="w-2 h-2" viewBox="0 0 8 8" fill="none">
                                        <path d="M1 4l2 2 4-4" stroke={cfg.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
            {!allVisible && (
                <div
                    className="px-3 py-1.5 border-t text-[10px] font-mono"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                >
                    {hiddenTypes.size} type{hiddenTypes.size !== 1 ? 's' : ''} hidden
                </div>
            )}
        </div>
    );
}

function TraceOverlay({
    sourceNode,
    direction,
    onDirectionChange,
    onClear,
    nodeCount,
    edgeCount,
    depthCount,
    chain,
}: {
    sourceNode: any;
    direction: 'downstream' | 'upstream' | 'both';
    onDirectionChange: (d: 'downstream' | 'upstream' | 'both') => void;
    onClear: () => void;
    nodeCount: number;
    edgeCount: number;
    depthCount: number;
    chain: string | null;
}) {
    const srcLabel = sourceNode?.data?.label ?? sourceNode?.id ?? 'Unknown';
    const srcType = sourceNode?.type ?? 'node';

    return (
        <div
            className="absolute top-4 left-1/2 -translate-x-1/2 surface-elevated px-4 py-3 z-20 min-w-[420px] max-w-[calc(100vw-3rem)]"
            style={{ borderRadius: 12 }}
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                    <div className="mono-label mb-0.5 flex items-center gap-1.5" style={{ color: 'var(--color-accent)' }}>
                        <Activity className="w-3 h-3" />
                        DATA FLOW TRACE
                    </div>
                    <div className="text-[13px] font-semibold truncate" title={srcLabel}>
                        {srcLabel}
                        <span className="ml-1.5 text-[10px] font-mono uppercase" style={{ color: 'var(--color-text-muted)' }}>
                            {srcType}
                        </span>
                    </div>
                </div>
                <button
                    onClick={onClear}
                    className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
                    title="Clear trace (or click empty canvas)"
                >
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 16 }}>×</span>
                </button>
            </div>

            {chain && (
                <div
                    className="text-[10px] font-mono mb-2.5 truncate"
                    style={{ color: 'var(--color-text-muted)' }}
                    title={chain}
                >
                    {chain}
                </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Direction toggle */}
                <div
                    className="flex items-center gap-0 rounded-md overflow-hidden border"
                    style={{ borderColor: 'var(--color-border-strong)' }}
                >
                    {(['upstream', 'downstream', 'both'] as const).map((d) => (
                        <button
                            key={d}
                            onClick={() => onDirectionChange(d)}
                            className="px-2.5 py-1 text-[10px] font-mono uppercase transition-colors"
                            style={{
                                background:
                                    direction === d ? 'var(--color-accent-dim)' : 'transparent',
                                color:
                                    direction === d ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                borderRight: d !== 'both' ? '1px solid var(--color-border)' : undefined,
                            }}
                        >
                            {d === 'upstream' ? '← Upstream' : d === 'downstream' ? 'Downstream →' : '↔ Both'}
                        </button>
                    ))}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    <span><span className="numeric">{nodeCount}</span> nodes</span>
                    <span><span className="numeric">{edgeCount}</span> edges</span>
                    <span><span className="numeric">{depthCount}</span> hops</span>
                </div>
            </div>
        </div>
    );
}

/** Floating architecture health score badge (top-left of canvas). */
function ArchitectureHealthBadge({
    insights,
    nodeCount,
    edgeCount,
    onClick,
}: {
    insights: AnalysisResult['insights'];
    nodeCount: number;
    edgeCount: number;
    onClick: () => void;
}) {
    const circularDeps = insights.circular_dependencies.length;
    const godClasses = insights.architecture_smells.filter(
        (s: any) => s.type === 'god_class',
    ).length;
    const orphanCount = insights.orphan_files.length;
    const hotspotCount = insights.high_complexity_files.length;

    // Match backend formula: -5 circular, -3 god class, -2 orphan, -1 hotspot
    const score = Math.max(
        0,
        100 - circularDeps * 5 - godClasses * 3 - orphanCount * 2 - hotspotCount * 1,
    );
    const grade =
        score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    const color =
        score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171';
    const label = `Health: ${score} / ${grade}`;

    const issueCount = circularDeps + godClasses + orphanCount + hotspotCount;
    const coupling = nodeCount > 0 ? (edgeCount / nodeCount).toFixed(1) : '0';

    return (
        <button
            onClick={onClick}
            className="absolute top-3 left-3 z-20 flex items-center gap-2.5 rounded-xl border px-3 py-2 backdrop-blur-md transition-all hover:translate-y-[-1px] hover:shadow-lg"
            style={{
                background: 'rgba(19,19,26,0.92)',
                borderColor: `${color}30`,
                boxShadow: `0 0 20px ${color}08`,
            }}
            title="Click for full architecture insights"
        >
            <div className="relative w-9 h-9">
                <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                    <circle
                        cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3"
                        strokeLinecap="round" strokeDasharray={`${(score / 100) * 88} 88`}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono" style={{ color }}>
                    {score}
                </span>
            </div>
            <div className="text-left">
                <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color }}>{label}</div>
                <div className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    {issueCount} issue{issueCount !== 1 ? 's' : ''} · {coupling} coupling
                </div>
            </div>
        </button>
    );
}

/** Shows dependency impact stats for the currently selected node. */
function DependencyImpactPreview({ nodes, edges }: { nodes: any[]; edges: any[] }) {
    const selected = nodes.find((n) => n.selected);
    if (!selected) return null;

    const nodeId = selected.id;
    const label = (selected.data as any)?.label ?? nodeId;
    const dependents = edges.filter((e) => e.source === nodeId).length;
    const dependencies = edges.filter((e) => e.target === nodeId).length;

    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const e of edges) {
            if (e.source === cur && !visited.has(e.target)) {
                visited.add(e.target);
                queue.push(e.target);
            }
        }
    }
    const transitiveImpact = visited.size;

    if (dependents === 0 && dependencies === 0) return null;

    return (
        <div
            className="absolute top-3 right-3 z-20 flex items-center gap-3 rounded-xl border px-3 py-2 backdrop-blur-md"
            style={{ background: 'rgba(19,19,26,0.92)', borderColor: 'var(--color-border-strong)' }}
        >
            <div className="text-[11px] font-medium truncate max-w-[140px]" title={label}>{label}</div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2.5 text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                <span title="Outgoing dependencies">
                    <span className="numeric" style={{ color: '#60a5fa' }}>{dependents}</span> out
                </span>
                <span title="Incoming dependencies">
                    <span className="numeric" style={{ color: '#a78bfa' }}>{dependencies}</span> in
                </span>
                {transitiveImpact > 0 && (
                    <span title="Transitive downstream impact — removing this could affect N modules">
                        <span className="numeric" style={{ color: transitiveImpact > 5 ? '#f87171' : '#fbbf24' }}>
                            {transitiveImpact}
                        </span>{' '}impact
                    </span>
                )}
            </div>
        </div>
    );
}
