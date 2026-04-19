/**
 * Project Manager — IndexedDB-backed multi-project persistence.
 *
 * Each project stores:
 *   - canvas state (nodes + edges)
 *   - AI analysis history (last brain result)
 *   - environment settings (framework, model, project path)
 */

const DB_NAME = 'archy-projects';
const DB_VERSION = 1;
const STORE = 'projects';

export interface SavedProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectPath: string;
  framework: string;
  model: string;
  files: string[];
  nodes: any[];
  edges: any[];
  insights: any | null;
  metrics: any | null;
}

function normalizeProjectPath(path: string): string {
  return (path || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function normalizeProjectName(name: string): string {
  return (name || '').trim().toLowerCase();
}

function projectIdentityKey(project: Pick<SavedProject, 'projectPath' | 'name'>): string {
  return `${normalizeProjectPath(project.projectPath)}::${normalizeProjectName(project.name)}`;
}

function dedupeProjects(projects: SavedProject[]): SavedProject[] {
  const byIdentity = new Map<string, SavedProject>();
  for (const project of projects) {
    const key = projectIdentityKey(project);
    const existing = byIdentity.get(key);
    if (!existing || project.updatedAt > existing.updatedAt) {
      byIdentity.set(key, project);
    }
  }
  return Array.from(byIdentity.values());
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listProjects(): Promise<SavedProject[]> {
  const store = await tx('readonly');
  const all = await idbRequest<SavedProject[]>(store.getAll());
  return dedupeProjects(all).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<SavedProject | undefined> {
  const store = await tx('readonly');
  return idbRequest(store.get(id));
}

export async function saveProject(project: SavedProject): Promise<string> {
  const store = await tx('readwrite');
  const existingProjects = await idbRequest<SavedProject[]>(store.getAll());
  const identity = projectIdentityKey(project);
  const existing = existingProjects.find(
    (p) => p.id !== project.id && projectIdentityKey(p) === identity,
  );

  const now = new Date().toISOString();
  const next: SavedProject = {
    ...project,
    id: existing?.id || project.id,
    createdAt: existing?.createdAt || project.createdAt || now,
    updatedAt: now,
  };

  await idbRequest(store.put(next));
  return next.id;
}

export async function deleteProject(id: string): Promise<void> {
  const store = await tx('readwrite');
  await idbRequest(store.delete(id));
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const existing = await getProject(id);
  if (!existing) return;
  existing.name = newName;
  existing.updatedAt = new Date().toISOString();
  await saveProject(existing);
}

export function createProjectId(): string {
  return `prj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
