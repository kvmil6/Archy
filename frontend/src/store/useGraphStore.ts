import { create } from 'zustand';
import type { Node, Edge, Connection, NodeChange, EdgeChange } from '@xyflow/react';
import { addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

export type ArchyNodeData = Record<string, unknown> & {
    label: string;
    method?: string; // For routes
    db?: string;     // For models
    body?: string;   // Canvas note cards
};

export type ArchyNode = Node<ArchyNodeData>;
export type ArchyEdge = Edge;

export type DetectedFramework =
    | 'django'
    | 'fastapi'
    | 'flask'
    | 'starlette'
    | 'tornado'
    | 'aiohttp'
    | 'express'
    | 'nextjs'
    | 'nestjs'
    | 'rails'
    | 'spring'
    | 'unknown';

interface GraphState {
    nodes: ArchyNode[];
    edges: ArchyEdge[];
    framework: DetectedFramework;

    // Actions
    setFramework: (fw: DetectedFramework) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    addNode: (node: ArchyNode) => void;
    setNodes: (nodes: ArchyNode[]) => void;
    setEdges: (edges: ArchyEdge[]) => void;
    updateNodeData: (id: string, data: Partial<ArchyNodeData>) => void;
    /** Remove nodes by id and any edges touching them. */
    removeNodesById: (ids: string[]) => void;
    /** Remove all currently selected nodes (and their edges). */
    removeSelectedNodes: () => void;
    getGraphJson: () => any; // For Phase 2 & 3
}

export const useGraphStore = create<GraphState>((set, get) => ({
    nodes: [],
    edges: [],
    framework: 'unknown',

    setFramework: (fw) => set({ framework: fw }),

    onNodesChange: (changes) =>
        set((state) => {
            const nextNodes = applyNodeChanges(changes, state.nodes) as ArchyNode[];
            const removedIds = new Set<string>();
            for (const ch of changes) {
                if (ch.type === 'remove') removedIds.add(ch.id);
            }
            if (removedIds.size === 0) {
                return { nodes: nextNodes };
            }
            return {
                nodes: nextNodes,
                edges: state.edges.filter(
                    (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
                ),
            };
        }),

    onEdgesChange: (changes) => set((state) => ({
        edges: applyEdgeChanges(changes, state.edges) as ArchyEdge[],
    })),

    onConnect: (connection) => set((state) => ({
        edges: addEdge({ ...connection, animated: true }, state.edges),
    })),

    addNode: (node) => set((state) => ({
        nodes: [...state.nodes, node],
    })),

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    updateNodeData: (id, newData) => set((state) => ({
        nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
        ),
    })),

    removeNodesById: (ids) => {
        const idSet = new Set(ids);
        set((state) => ({
            nodes: state.nodes.filter((n) => !idSet.has(n.id)),
            edges: state.edges.filter(
                (e) => !idSet.has(e.source) && !idSet.has(e.target),
            ),
        }));
    },

    removeSelectedNodes: () => {
        set((state) => {
            const removed = new Set(
                state.nodes.filter((n) => n.selected).map((n) => n.id),
            );
            if (removed.size === 0) return state;
            return {
                nodes: state.nodes.filter((n) => !removed.has(n.id)),
                edges: state.edges.filter(
                    (e) => !removed.has(e.source) && !removed.has(e.target),
                ),
            };
        });
    },

    getGraphJson: () => {
        const { nodes, edges, framework } = get();
        return {
            framework,
            projectName: "new-project", // TODO: Get from Home page context
            nodes: nodes.map(n => ({
                id: n.id,
                type: n.type,
                label: n.data.label,
                method: n.data.method,
                db: n.data.db,
                position: n.position,
            })),
            edges: edges.map(e => ({
                source: e.source,
                target: e.target,
                type: e.type || 'default', // 'dependency', 'async', 'direct'
            })),
        };
    },
}));    