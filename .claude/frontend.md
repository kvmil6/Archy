# Archy Frontend — Architecture Reference

## Stack

- **Framework**: React 18/19 + TypeScript + Vite 8
- **Styling**: TailwindCSS 3 + custom CSS variables in `index.css`
- **Graph**: `@xyflow/react` v12 (ReactFlow)
- **State**: Zustand 5 (`useGraphStore`)
- **Routing**: React Router v6
- **Icons**: Lucide React
- **Build**: `cmd /c "cd frontend && npm run build"` (Windows — never use `npm.ps1`)
- **Dev**: `cmd /c "cd frontend && npm run dev"`

## Design System (`src/index.css`)

```css
--color-bg:           #0a0a0f
--color-surface:      #13131a
--color-accent:       #7c86ff
--color-text-muted:   #71717a
--color-border:       rgba(255,255,255,0.08)
--color-border-strong: rgba(255,255,255,0.15)
```

Key CSS classes:
- `.mono-label` — small monospace label
- `.surface` / `.surface-elevated` — dark card surfaces
- `.kbd` — keyboard shortcut badge
- `.cmd-k-root` / `.cmd-k-panel` / `.cmd-k-input` / `.cmd-k-item` — command palette

## Routing (`src/App.tsx`)

```
/          → HomePage
/canvas    → CanvasPage
```

Navigation to `/canvas` passes `location.state`:
```ts
{
  files: string[],        // absolute file paths
  projectPath: string,    // root directory
  framework: string,      // detected framework name
  projectName: string,
  model: string,
  projectId?: string,
  restoredNodes?: Node[],
  restoredEdges?: Edge[],
  restoredInsights?: ...,
  restoredMetrics?: ...,
}
```

## Zustand Store (`src/store/useGraphStore.ts`)

```ts
nodes: Node[]
edges: Edge[]
framework: string | null
onNodesChange(changes)
onEdgesChange(changes)
onConnect(connection)
addNode(node)
setNodes(nodes)
setEdges(edges)
setFramework(fw)
removeSelectedNodes()
```

## Component Inventory

| Component | File | Purpose |
|-----------|------|---------|
| `HomePage` | `pages/HomePage.tsx` | Landing page, project list, open project button, navbar |
| `CanvasPage` | `pages/CanvasPage.tsx` | Main canvas with ReactFlow, sidebar, all panels |
| `Sidebar` | `components/Sidebar.tsx` | Collapsible file/node list sidebar |
| `NodeTypes` | `components/NodeTypes.tsx` | Custom ReactFlow node renderers |
| `AIBrainPanel` | `components/AIBrainPanel.tsx` | AI Brain chat + file analysis panel |
| `SecurityPanel` | `components/SecurityPanel.tsx` | Security scan modal with HTML report |
| `FileDetailPanel` | `components/FileDetailPanel.tsx` | Per-file deep analysis panel |
| `ExportArchitectureModal` | `components/ExportArchitectureModal.tsx` | Export graph as AI prompt / image |
| `CommandPalette` | `components/CommandPalette.tsx` | Cmd+K command palette |
| `GraphSearch` | `components/GraphSearch.tsx` | Node search overlay |
| `APIConfig` | `components/APIConfig.tsx` | OpenRouter key configuration |
| `ModelSelector` | `components/ModelSelector.tsx` | AI model picker |
| `Logo` | `components/Logo.tsx` | SVG logo component |
| `Toast` | `components/Toast.tsx` | Toast notification system |
| `DebugBanner` | `components/DebugBanner.tsx` | Dev-mode debug info banner |
| `RuntimeInsightsPanel` | `components/RuntimeInsightsPanel.tsx` | Runtime activity and command visibility panel |

## Services (`src/services/`)

| File | Purpose |
|------|---------|
| `apiClient.ts` | Exports `BACKEND_URL` (reads `VITE_BACKEND_URL`, defaults `http://localhost:8000`) |
| `architectureAnalyzer.ts` | `analyzeProject(files, options)` — calls `/parser/analyze-project` |
| `databaseInspector.ts` | `inspectDatabase(path, labels)` + `detectDatabases(path)` |
| `fileSystem.ts` | `getFileContent(path)` — File System Access API |
| `frameworkDetector.ts` | `detectFramework(files)` — heuristics from file paths |
| `graphExport.ts` | `mergeDBFragment(nodes, edges, fragment)` |
| `runtimeInsights.ts` | Track runtime events + fetch runtime summary |

## Project Persistence (`src/services/projectManager.ts`)

IndexedDB: `archy-projects` DB, `projects` object store.

```ts
listProjects(): Promise<SavedProject[]>
getProject(id): Promise<SavedProject | undefined>
saveProject(project): Promise<void>
deleteProject(id): Promise<void>
renameProject(id, name): Promise<void>
createProjectId(): string
```

`SavedProject` shape:
```ts
{
  id: string,
  name: string,
  createdAt: string,
  updatedAt: string,
  projectPath: string,
  framework: string,
  model: string,
  files: string[],
  nodes: Node[],
  edges: Edge[],
  insights: ...,
  metrics: ...,
}
```

## ReactFlow Configuration (`CanvasPage.tsx`)

```tsx
<ReactFlow
  minZoom={0.05}
  maxZoom={4}
  panOnDrag={[1, 2]}        // middle + right mouse to pan
  selectionOnDrag={false}
  snapToGrid={false}
  fitViewOptions={{ padding: 0.15, duration: 600 }}
  onlyRenderVisibleElements  // threshold: 80
>
  <Background color="rgba(255,255,255,0.04)" gap={28} size={1} />
</ReactFlow>
```

## Custom Node Types

Defined in `NodeTypes.tsx`, registered in `CanvasPage.tsx`:

| Type | Visual | Used For |
|------|--------|---------|
| `class` | Purple accent | Python classes |
| `function` | Blue accent | Functions / methods |
| `route` | Green accent | API routes |
| `model` | Orange accent | Data models |
| `module` | Gray | Python modules |
| `database` | Teal | DB tables |
| `note` | Yellow | Canvas notes |

## Key Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open command palette |
| `Ctrl+F` or `/` | Open graph search |
| `Ctrl+R` | Re-analyze project |
| `Ctrl+B` | Toggle AI Brain panel |
| `Ctrl+E` | Open export modal |
| `Ctrl+I` | Toggle insights panel |
| `F` | Fit view |
| `Esc` | Close panel / deselect |

## API Communication

Always import `BACKEND_URL` from `@/services/apiClient`:
```ts
import { BACKEND_URL } from '@/services/apiClient';
const res = await fetch(`${BACKEND_URL}/brain/chat`, { ... });
```

Never hardcode `http://localhost:8000` in components.
