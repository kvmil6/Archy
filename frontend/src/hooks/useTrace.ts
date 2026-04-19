import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';

export type TraceDirection = 'downstream' | 'upstream' | 'both';

export type TraceResult = {
    /** Set of node ids that belong to the trace (including the source). */
    nodeIds: Set<string>;
    /** Set of edge ids that belong to the trace. */
    edgeIds: Set<string>;
    /** Node ids at each depth level from the source (0 = source). */
    depthLevels: string[][];
    /** The type of each hop — useful for labeling the chain ('FK' → 'admin' → ...). */
    hopKinds: Record<string, string>;
};

/**
 * Computes the data-flow trace from a source node through the graph.
 *
 * "Downstream" means: follow edges in their arrow direction.
 * E.g. URL → View → Service → Model → DB
 *
 * "Upstream" follows edges in reverse (what depends on this node).
 *
 * BFS-based so the depth levels are meaningful for layered highlighting.
 */
export function useTrace(
    nodes: Node[],
    edges: Edge[],
    sourceId: string | null,
    direction: TraceDirection = 'downstream',
    maxDepth = 10,
): TraceResult | null {
    return useMemo(() => {
        if (!sourceId) return null;
        const sourceExists = nodes.some((n) => n.id === sourceId);
        if (!sourceExists) return null;

        // Adjacency lists for O(1) traversal
        const outEdges = new Map<string, Edge[]>();
        const inEdges = new Map<string, Edge[]>();
        for (const edge of edges) {
            (outEdges.get(edge.source) ?? outEdges.set(edge.source, []).get(edge.source)!).push(edge);
            (inEdges.get(edge.target) ?? inEdges.set(edge.target, []).get(edge.target)!).push(edge);
        }

        const visitedNodes = new Set<string>([sourceId]);
        const visitedEdges = new Set<string>();
        const depthLevels: string[][] = [[sourceId]];
        const hopKinds: Record<string, string> = {};

        // BFS
        let frontier: string[] = [sourceId];
        for (let depth = 1; depth <= maxDepth; depth++) {
            const nextFrontier: string[] = [];
            for (const nodeId of frontier) {
                const neighbors: Array<{ nextId: string; edge: Edge }> = [];
                if (direction === 'downstream' || direction === 'both') {
                    for (const e of outEdges.get(nodeId) ?? []) {
                        neighbors.push({ nextId: e.target, edge: e });
                    }
                }
                if (direction === 'upstream' || direction === 'both') {
                    for (const e of inEdges.get(nodeId) ?? []) {
                        neighbors.push({ nextId: e.source, edge: e });
                    }
                }
                for (const { nextId, edge } of neighbors) {
                    visitedEdges.add(edge.id);
                    if (!visitedNodes.has(nextId)) {
                        visitedNodes.add(nextId);
                        nextFrontier.push(nextId);
                        const kind = (edge.data as any)?.kind || edge.type || 'edge';
                        hopKinds[nextId] = String(kind);
                    }
                }
            }
            if (nextFrontier.length === 0) break;
            depthLevels.push(nextFrontier);
            frontier = nextFrontier;
        }

        return {
            nodeIds: visitedNodes,
            edgeIds: visitedEdges,
            depthLevels,
            hopKinds,
        };
    }, [nodes, edges, sourceId, direction, maxDepth]);
}

/**
 * Compute a concise string description of the traced chain.
 * Example: "Route → Controller → Service → Model"
 */
export function describeTrace(
    trace: TraceResult,
    nodes: Node[],
): string {
    if (!trace.depthLevels.length) return '';
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // Take one representative node per level (the first visited)
    const labels: string[] = [];
    for (const level of trace.depthLevels) {
        const sample = nodeById.get(level[0]);
        if (!sample) continue;
        const type = (sample.type || 'node').replace(/([A-Z])/g, ' $1').trim();
        const name = (sample.data as any)?.label ?? level[0];
        labels.push(`${type}:${name}`);
        if (labels.length >= 6) {
            labels.push(`+${trace.depthLevels.length - 6} more`);
            break;
        }
    }
    return labels.join(' → ');
}
