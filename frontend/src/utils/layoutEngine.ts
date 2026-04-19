import type { Edge } from '@xyflow/react';

type AnyNode = { id: string; type?: string; position: { x: number; y: number }; [key: string]: any };

const NODE_W = 280;
const NODE_H = 128;
const H_GAP = 90;
const V_GAP = 50;

const LAYER_ORDER: Record<string, number> = {
  app: 0,
  module: 0,
  entryInterface: 1,
  route: 1,
  controller: 2,
  diContainer: 2,
  service: 3,
  domain: 3,
  repoInterface: 4,
  repository: 4,
  model: 5,
  schema: 5,
  utility: 6,
};

function getLayer(type: string): number {
  return LAYER_ORDER[type] ?? 3;
}

export type LayoutMode = 'hierarchical' | 'tree' | 'radial' | 'force' | 'hub';

export function applyClientLayout(
  nodes: AnyNode[],
  edges: Edge[],
  mode: LayoutMode = 'hierarchical',
): AnyNode[] {
  if (nodes.length === 0) return nodes;
  switch (mode) {
    case 'hierarchical': return hierarchicalLayout(nodes, edges);
    case 'tree':         return treeLayout(nodes, edges);
    case 'radial':       return radialLayout(nodes, edges);
    case 'force':        return forceLayout(nodes, edges);
    case 'hub':          return hubLayout(nodes, edges);
    default:             return hierarchicalLayout(nodes, edges);
  }
}

/**
 * Obsidian Canvas–style hub: one focal node in the center, satellites on a ring.
 * Prefers `app` / highest graph degree as the center.
 */
function hubLayout(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  let centerId = nodes[0].id;
  let bestScore = -1;
  for (const n of nodes) {
    const d = degree.get(n.id) || 0;
    const typeBoost =
      n.type === 'app' ? 5000 :
      n.type === 'module' ? 800 :
      n.type === 'canvasCard' ? -2000 : 0;
    const score = d * 10 + typeBoost;
    if (score > bestScore) {
      bestScore = score;
      centerId = n.id;
    }
  }

  const satellites = nodes.filter((n) => n.id !== centerId);
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(centerId, { x: 0, y: 0 });

  const nSat = satellites.length;
  const baseR = 300;
  const R = nSat <= 1 ? baseR : Math.min(560, baseR + Math.min(240, nSat * 10));

  for (let i = 0; i < nSat; i++) {
    const angle = (2 * Math.PI * i) / Math.max(nSat, 1) - Math.PI / 2;
    pos.set(satellites[i].id, {
      x: R * Math.cos(angle),
      y: R * Math.sin(angle),
    });
  }

  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

function hierarchicalLayout(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  const layerMap = new Map<number, AnyNode[]>();
  for (const node of nodes) {
    const l = getLayer(node.type || 'utility');
    if (!layerMap.has(l)) layerMap.set(l, []);
    layerMap.get(l)!.push(node);
  }

  const layers = [...layerMap.entries()].sort(([a], [b]) => a - b);

  const neighbors = new Map<string, string[]>();
  for (const e of edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, []);
    if (!neighbors.has(e.target)) neighbors.set(e.target, []);
    neighbors.get(e.source)!.push(e.target);
    neighbors.get(e.target)!.push(e.source);
  }

  const posIdx = new Map<string, number>();
  for (const [, ln] of layers) {
    ln.sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
    ln.forEach((n, i) => posIdx.set(n.id, i));
  }

  for (let iter = 0; iter < 4; iter++) {
    for (const [, ln] of layers) {
      ln.sort((a, b) => {
        const avg = (id: string) => {
          const nb = neighbors.get(id) || [];
          if (nb.length === 0) return posIdx.get(id) || 0;
          return nb.reduce((s, n) => s + (posIdx.get(n) || 0), 0) / nb.length;
        };
        return avg(a.id) - avg(b.id);
      });
      ln.forEach((n, i) => posIdx.set(n.id, i));
    }
  }

  const STEP_X = NODE_W + H_GAP;
  const STEP_Y = NODE_H + V_GAP;
  const maxSize = Math.max(...layers.map(([, ns]) => ns.length), 1);
  const totalH = maxSize * STEP_Y;

  const pos = new Map<string, { x: number; y: number }>();
  for (let si = 0; si < layers.length; si++) {
    const [, ln] = layers[si];
    const x = si * STEP_X;
    const layerH = ln.length * STEP_Y;
    const startY = (totalH - layerH) / 2;
    for (let i = 0; i < ln.length; i++) {
      pos.set(ln[i].id, { x, y: startY + i * STEP_Y });
    }
  }

  return nodes.map(n => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

function treeLayout(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source)!.push(e.target);
    hasParent.add(e.target);
  }

  const roots = nodes.filter(n => !hasParent.has(n.id)).map(n => n.id);
  if (roots.length === 0) return hierarchicalLayout(nodes, edges);

  const STEP_X = NODE_W + H_GAP;
  const STEP_Y = NODE_H + V_GAP;
  const colRows = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  const place = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const row = colRows.get(depth) ?? 0;
    colRows.set(depth, row + 1);
    pos.set(id, { x: depth * STEP_X, y: row * STEP_Y });
    for (const child of (children.get(id) || [])) place(child, depth + 1);
  };

  for (const r of roots) place(r, 0);

  const maxDepth = Math.max(0, ...colRows.keys());
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const row = colRows.get(maxDepth + 1) ?? 0;
      colRows.set(maxDepth + 1, row + 1);
      pos.set(n.id, { x: (maxDepth + 1) * STEP_X, y: row * STEP_Y });
    }
  }

  return nodes.map(n => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

function radialLayout(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  const sorted = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(sorted[0].id, { x: 0, y: 0 });

  const RING_R = 380;
  const rings = [sorted.slice(1, 8), sorted.slice(8, 22), sorted.slice(22)];

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const radius = RING_R * (r + 1);
    for (let i = 0; i < ring.length; i++) {
      const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2;
      pos.set(ring[i].id, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }
  }

  return nodes.map(n => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

function forceLayout(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  if (nodes.length === 0) return nodes;

  const initR = Math.max(300, nodes.length * 20);
  const state = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    state.set(n.id, {
      x: initR * Math.cos(angle),
      y: initR * Math.sin(angle),
      vx: 0,
      vy: 0,
    });
  });

  const REPULSION = 14000;
  const SPRING_K = 0.07;
  const SPRING_LEN = 340;
  const DAMPING = 0.84;
  const ITERS = Math.min(100, 40 + nodes.length * 1.5) | 0;
  const ids = nodes.map(n => n.id);

  for (let iter = 0; iter < ITERS; iter++) {
    const fx = new Map(ids.map(id => [id, 0]));
    const fy = new Map(ids.map(id => [id, 0]));

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = state.get(ids[i])!;
        const b = state.get(ids[j])!;
        const dx = a.x - b.x || 0.1;
        const dy = a.y - b.y || 0.1;
        const d2 = dx * dx + dy * dy;
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        fx.set(ids[i], fx.get(ids[i])! + ux);
        fy.set(ids[i], fy.get(ids[i])! + uy);
        fx.set(ids[j], fx.get(ids[j])! - ux);
        fy.set(ids[j], fy.get(ids[j])! - uy);
      }
    }

    for (const e of edges) {
      const a = state.get(e.source);
      const b = state.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING_K * (d - SPRING_LEN);
      const sfx = (dx / d) * f;
      const sfy = (dy / d) * f;
      fx.set(e.source, (fx.get(e.source) || 0) + sfx);
      fy.set(e.source, (fy.get(e.source) || 0) + sfy);
      fx.set(e.target, (fx.get(e.target) || 0) - sfx);
      fy.set(e.target, (fy.get(e.target) || 0) - sfy);
    }

    for (const id of ids) {
      const s = state.get(id)!;
      s.vx = (s.vx + fx.get(id)!) * DAMPING;
      s.vy = (s.vy + fy.get(id)!) * DAMPING;
      s.x += s.vx;
      s.y += s.vy;
    }
  }

  return nodes.map(n => {
    const s = state.get(n.id);
    return s ? { ...n, position: { x: s.x, y: s.y } } : n;
  });
}
