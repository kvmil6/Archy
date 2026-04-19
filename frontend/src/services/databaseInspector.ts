import type { Node, Edge } from '@xyflow/react';
import { BACKEND_URL } from '@/services/apiClient';

export interface DBCandidate {
    path: string;
    name: string;
    size_bytes: number;
    rank: number;
}

/** Parsed database connection info from env vars or settings files. */
export interface DBConnectionInfo {
    type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'redis' | 'unknown';
    host: string;
    port: string;
    username: string;
    password: string;
    database: string;
    rawUrl: string;
    source: string; // which .env key or settings file it came from
}

/**
 * Parse a DATABASE_URL or similar connection string into structured info.
 *
 * Supports:
 *   postgres://user:pass@host:port/dbname
 *   mysql://user:pass@host:port/dbname
 *   mongodb://user:pass@host:port/dbname
 *   redis://host:port/0
 *   sqlite:///path/to/db.sqlite3
 */
export function parseConnectionString(url: string, source = 'DATABASE_URL'): DBConnectionInfo | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed.includes('://')) return null;

    const schemeMatch = trimmed.match(/^(\w+(?:\+\w+)?):\/\//);
    if (!schemeMatch) return null;

    const scheme = schemeMatch[1].toLowerCase();
    let type: DBConnectionInfo['type'] = 'unknown';
    if (scheme.startsWith('postgres') || scheme.startsWith('postgresql')) type = 'postgresql';
    else if (scheme.startsWith('mysql') || scheme.startsWith('mariadb')) type = 'mysql';
    else if (scheme.startsWith('mongodb')) type = 'mongodb';
    else if (scheme.startsWith('redis')) type = 'redis';
    else if (scheme.startsWith('sqlite')) type = 'sqlite';

    try {
        // Replace postgres:// with http:// temporarily so URL parser works
        const fakeParseable = trimmed.replace(/^[^:]+:\/\//, 'http://');
        const parsed = new URL(fakeParseable);
        return {
            type,
            host: parsed.hostname || 'localhost',
            port: parsed.port || (type === 'postgresql' ? '5432' : type === 'mysql' ? '3306' : type === 'mongodb' ? '27017' : type === 'redis' ? '6379' : ''),
            username: decodeURIComponent(parsed.username || ''),
            password: decodeURIComponent(parsed.password || ''),
            database: parsed.pathname?.replace(/^\//, '') || '',
            rawUrl: trimmed,
            source,
        };
    } catch {
        return null;
    }
}

/**
 * Scan .env file content for database connection strings.
 */
export function detectDBConnectionsFromEnv(envContent: string, filename = '.env'): DBConnectionInfo[] {
    const connections: DBConnectionInfo[] = [];
    const dbKeyPatterns = [
        /database_url/i, /db_url/i, /postgres/i, /mysql/i,
        /mongodb/i, /redis_url/i, /redis/i, /sql/i,
    ];

    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!dbKeyPatterns.some((p) => p.test(key))) continue;
        const info = parseConnectionString(value, `${filename}:${key}`);
        if (info) connections.push(info);
    }

    return connections;
}

export interface InspectionMetadata {
    path: string;
    table_count: number;
    sqlite_version: string;
    file_size_bytes: number;
}

export interface DBFragment {
    nodes: Node[];
    edges: Edge[];
    metadata: InspectionMetadata;
    inspection: any;
}

/**
 * Walk the project to find SQLite databases.
 */
export async function detectDatabases(projectPath: string): Promise<DBCandidate[]> {
    const res = await fetch(`${BACKEND_URL}/database/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Detect failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.candidates || [];
}

/**
 * Inspect a SQLite file and return graph nodes/edges for it.
 */
export async function inspectDatabase(
    dbPath: string,
    existingClassLabels?: string[],
    includeRowCounts = true,
): Promise<DBFragment> {
    const res = await fetch(`${BACKEND_URL}/database/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            db_path: dbPath,
            include_row_counts: includeRowCounts,
            existing_class_labels: existingClassLabels,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Inspect failed: HTTP ${res.status}`);
    }
    return res.json();
}

/**
 * Merge a DB fragment into an existing graph.
 * Resolves "class-by-label:xxx" source ids to real class node ids.
 * Positions DB table nodes to the right of existing nodes.
 */
export function mergeDBFragment(
    existingNodes: Node[],
    existingEdges: Edge[],
    fragment: DBFragment,
): { nodes: Node[]; edges: Edge[] } {
    // Build label → first-matching-node-id map (case insensitive)
    const labelToId = new Map<string, string>();
    for (const n of existingNodes) {
        const label = String((n.data as any)?.label ?? '').toLowerCase();
        if (label && !labelToId.has(label)) {
            labelToId.set(label, n.id);
        }
    }

    // Find the rightmost existing x coord to position DB nodes after
    let maxX = 0;
    let minY = Infinity;
    for (const n of existingNodes) {
        if (n.position.x > maxX) maxX = n.position.x;
        if (n.position.y < minY) minY = n.position.y;
    }
    if (!isFinite(minY)) minY = 100;
    const dbColumnX = maxX + 400;

    // Build positioned DB nodes (stacked vertically, starting from minY)
    const dbNodes: Node[] = fragment.nodes.map((n, idx) => ({
        ...n,
        position: { x: dbColumnX, y: minY + idx * 110 },
    })) as Node[];

    // Resolve class-by-label source ids and drop unresolvable class-table edges
    const resolvedEdges: Edge[] = [];
    for (const e of fragment.edges) {
        const src = e.source;
        if (src.startsWith('class-by-label:')) {
            const label = src.slice('class-by-label:'.length).toLowerCase();
            const classNodeId = labelToId.get(label);
            if (!classNodeId) continue; // Skip edges to classes that don't exist in graph
            resolvedEdges.push({ ...e, source: classNodeId });
        } else {
            resolvedEdges.push(e);
        }
    }

    // Deduplicate by id (frag might have been merged before)
    const existingIds = new Set(existingNodes.map((n) => n.id));
    const existingEdgeIds = new Set(existingEdges.map((e) => e.id));
    const newNodes = dbNodes.filter((n) => !existingIds.has(n.id));
    const newEdges = resolvedEdges.filter((e) => !existingEdgeIds.has(e.id));

    return {
        nodes: [...existingNodes, ...newNodes],
        edges: [...existingEdges, ...newEdges],
    };
}
