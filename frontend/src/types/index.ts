import type { Node, Edge } from '@xyflow/react';

export type NodeType = 'route' | 'service' | 'model';

export interface ArchyNodeData extends Record<string, unknown> {
  label: string;
  method?: string;
  db?: string;
}

export type ArchyNode = Node<ArchyNodeData, NodeType>;

export interface GraphData {
  framework: string;
  nodes: ArchyNode[];
  edges: Edge[];
}

export interface AppState {
  nodes: ArchyNode[];
  edges: Edge[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;
  setNodes: (nodes: ArchyNode[]) => void;
  setEdges: (edges: Edge[]) => void;
}
