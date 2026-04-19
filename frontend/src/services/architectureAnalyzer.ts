/**
 * Architecture Analyzer Service
 * Reads actual Python files from the folder and sends them to the backend parser
 * to build a real architecture graph.
 */
import { getFileContent } from './fileSystem';
import { BACKEND_URL } from './apiClient';
const MAX_FILES_TO_ANALYZE = 200; // Cap to avoid huge requests
const MAX_FILE_SIZE = 500_000; // 500KB per file

export interface AnalyzedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    filepath: string;
    line?: number;
    description?: string;
    bases?: string[];
    methods?: string[];
    methodCount?: number;
    complexity?: number;
    category?: string;
    decorators?: string[];
    isAsync?: boolean;
    method?: string;
    functionCount?: number;
  };
}

export interface AnalyzedEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated?: boolean;
  label?: string;
}

export interface ProjectMetrics {
  total_files: number;
  total_classes: number;
  total_functions: number;
  total_lines: number;
  average_complexity: number;
  total_models: number;
  total_views: number;
  total_routes: number;
}

export interface ProjectInsights {
  circular_dependencies: string[][];
  high_complexity_files: Array<{
    path: string;
    complexity: number;
    suggestion: string;
  }>;
  orphan_files: string[];
  architecture_smells: Array<{
    type: string;
    location: string;
    severity: string;
    suggestion: string;
  }>;
}

export interface AnalysisResult {
  nodes: AnalyzedNode[];
  edges: AnalyzedEdge[];
  metrics: ProjectMetrics;
  insights: ProjectInsights;
}

export type AnalyzeOptions = {
  /** Omit Django migration files from the graph (default true — reduces clutter). */
  excludeMigrations?: boolean;
};

function isMigrationPath(path: string): boolean {
  const p = path.replace(/\\/g, '/').toLowerCase();
  if (!p.includes('/migrations/')) return false;
  const base = path.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  return base !== '__init__.py';
}

/**
 * Analyze project: reads actual files from folder and parses them
 */
export async function analyzeProject(
  filePaths: string[],
  options: AnalyzeOptions = {},
): Promise<AnalysisResult | null> {
  const excludeMigrations = options.excludeMigrations !== false;
  // Only process Python files; optionally drop migrations before sending to backend
  let pythonFiles = filePaths.filter(p => p.endsWith('.py'));
  if (excludeMigrations) {
    pythonFiles = pythonFiles.filter(p => !isMigrationPath(p));
  }

  if (pythonFiles.length === 0) {
    return null;
  }

  // Cap number of files
  const filesToAnalyze = pythonFiles.slice(0, MAX_FILES_TO_ANALYZE);
  
  // Read file contents in parallel with concurrency limit
  const BATCH_SIZE = 10;
  const fileData: Array<{ path: string; content: string }> = [];
  
  for (let i = 0; i < filesToAnalyze.length; i += BATCH_SIZE) {
    const batch = filesToAnalyze.slice(i, i + BATCH_SIZE);
    const contents = await Promise.all(
      batch.map(async (path) => {
        try {
          const content = await getFileContent(path);
          if (content === null || content.length > MAX_FILE_SIZE) {
            return null;
          }
          return { path, content };
        } catch {
          return null;
        }
      })
    );
    
    for (const item of contents) {
      if (item) fileData.push(item);
    }
  }
  
  if (fileData.length === 0) {
    console.warn('No Python files could be read');
    return null;
  }
  
  // Send to backend parser
  try {
    const response = await fetch(`${BACKEND_URL}/parser/analyze-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: fileData,
        exclude_migrations: excludeMigrations,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Parser API returned ${response.status}`);
    }
    
    const result: AnalysisResult = await response.json();

    // Upgrade all edge types to smoothstep + add subtle stagger to positions
    // so nodes in the same column aren't perfectly stacked
    result.edges = result.edges.map(e => ({
      ...e,
      type: 'smoothstep',
      style: {
        strokeWidth: 1.5,
        stroke: e.animated ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.18)',
      },
    }));

    return result;
  } catch (error) {
    console.error('Architecture analysis failed:', error);
    return null;
  }
}

/**
 * Quick local analysis fallback when backend isn't available.
 * Supports Django, FastAPI, Flask and generic Python structures.
 */
export function localQuickAnalyze(
  filePaths: string[],
  options: AnalyzeOptions = {},
): AnalysisResult {
  const excludeMigrations = options.excludeMigrations !== false;
  let pythonFiles = filePaths.filter(p => p.endsWith('.py'));
  if (excludeMigrations) {
    pythonFiles = pythonFiles.filter(p => !isMigrationPath(p));
  }

  // Detect framework hints from paths
  const hasRouters = pythonFiles.some(p => p.includes('/routers/'));
  const hasManagePy = pythonFiles.some(p => p.endsWith('manage.py'));
  const hasViews = pythonFiles.some(p => p.includes('views'));
  const hasUrls = pythonFiles.some(p => p.includes('urls'));

  const classifyFile = (path: string): { type: string; category: string } => {
    const filename = path.split('/').pop() || path;
    const f = filename.toLowerCase().replace('.py', '');
    const inPath = (sub: string) => path.toLowerCase().includes(sub);

    // FastAPI patterns
    if (inPath('/routers/') || f === 'router') return { type: 'route', category: 'routing' };
    if (f === 'main' || f === 'app' || f === 'server') return { type: 'app', category: 'entry' };
    if (f === 'dependencies' || f === 'deps') return { type: 'diContainer', category: 'infrastructure' };
    if (inPath('schemas') || f === 'schemas' || f === 'schema') return { type: 'schema', category: 'data' };

    // Django patterns
    if (f === 'models' || inPath('/models/')) return { type: 'model', category: 'data' };
    if (f === 'views' || inPath('/views/')) return { type: 'controller', category: 'interface' };
    if (f === 'urls') return { type: 'route', category: 'routing' };
    if (f === 'serializers' || f === 'serializer') return { type: 'schema', category: 'data' };
    if (f === 'admin') return { type: 'service', category: 'interface' };
    if (f === 'forms' || f === 'form') return { type: 'schema', category: 'data' };

    // Shared patterns
    if (inPath('service') || f.endsWith('_service') || f.startsWith('service_')) return { type: 'service', category: 'domain' };
    if (inPath('repository') || inPath('/repo/') || f.endsWith('_repo')) return { type: 'repository', category: 'infrastructure' };
    if (f === 'config' || f === 'settings' || f === 'configuration') return { type: 'utility', category: 'config' };
    if (inPath('middleware')) return { type: 'utility', category: 'infrastructure' };
    if (inPath('tasks') || f === 'tasks') return { type: 'service', category: 'domain' };

    return { type: 'utility', category: 'module' };
  };

  // Group by category for layered layout
  const categoryOrder = ['entry', 'routing', 'interface', 'domain', 'infrastructure', 'data', 'config', 'module'];
  const LAYER_GAP_X = 320;
  const LAYER_GAP_Y = 160;
  const categoryMap = new Map<string, AnalyzedNode[]>();

  const nodes: AnalyzedNode[] = pythonFiles.slice(0, 100).map((path, index) => {
    const filename = path.split('/').pop() || path;
    const { type, category } = classifyFile(path);
    return {
      id: `node-${index}`,
      type,
      position: { x: 0, y: 0 }, // will be set below
      data: {
        label: filename.replace('.py', ''),
        filepath: path,
        category,
      },
    };
  });

  // Assign positions in a layered layout
  for (const node of nodes) {
    const cat = (node.data as any).category as string;
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(node);
  }

  const sortedCategories = [...categoryMap.keys()].sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  sortedCategories.forEach((cat, colIdx) => {
    const colNodes = categoryMap.get(cat)!;
    colNodes.forEach((n, rowIdx) => {
      n.position = {
        x: 80 + colIdx * LAYER_GAP_X,
        y: 80 + rowIdx * LAYER_GAP_Y,
      };
    });
  });

  // Build simple edges (routing → interface/domain, domain → data)
  const edges: AnalyzedEdge[] = [];
  const routeNodes = nodes.filter(n => (n.data as any).category === 'routing');
  const serviceNodes = nodes.filter(n => (n.data as any).category === 'domain');
  const dataNodes = nodes.filter(n => (n.data as any).category === 'data');
  const entryNodes = nodes.filter(n => (n.data as any).category === 'entry');

  entryNodes.forEach(e => {
    routeNodes.slice(0, 3).forEach(r => {
      edges.push({ id: `e-${e.id}-${r.id}`, source: e.id, target: r.id, type: 'smoothstep', animated: false });
    });
  });

  routeNodes.forEach(r => {
    serviceNodes.slice(0, 2).forEach(s => {
      edges.push({ id: `e-${r.id}-${s.id}`, source: r.id, target: s.id, type: 'smoothstep', animated: true });
    });
  });

  serviceNodes.forEach(s => {
    dataNodes.slice(0, 2).forEach(d => {
      edges.push({ id: `e-${s.id}-${d.id}`, source: s.id, target: d.id, type: 'smoothstep', animated: false });
    });
  });

  return {
    nodes,
    edges,
    metrics: {
      total_files: pythonFiles.length,
      total_classes: 0,
      total_functions: 0,
      total_lines: 0,
      average_complexity: 0,
      total_models: pythonFiles.filter(p => p.includes('models')).length,
      total_views: pythonFiles.filter(p => p.includes('views') || p.includes('routers')).length,
      total_routes: pythonFiles.filter(p => p.includes('urls') || p.includes('routers')).length,
    },
    insights: {
      circular_dependencies: [],
      high_complexity_files: [],
      orphan_files: [],
      architecture_smells: [],
    },
  };
}
