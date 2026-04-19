declare global {
  interface Window {
    electronAPI?: {
      openFolder: () => Promise<string | null>;
      scanDirectory: (folderPath: string) => Promise<string[]>;
      readFile: (filePath: string) => Promise<string | null>;
      readRelativeFile: (folderPath: string, relativePath: string) => Promise<string | null>;
      openExternal: (url: string) => Promise<void>;
      isElectron: boolean;
    };
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isElectron = (): boolean =>
  typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let currentDirectoryHandle: FileSystemDirectoryHandle | null = null;
let currentProjectPath: string = '';
let currentElectronFolderPath: string = '';
let currentTauriProjectPath: string = '';

export const storeDirectoryHandle = (handle: FileSystemDirectoryHandle, projectPath: string) => {
  currentDirectoryHandle = handle;
  currentProjectPath = projectPath;

  const request = indexedDB.open('archy-fs', 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('handles')) {
      db.createObjectStore('handles', { keyPath: 'id' });
    }
  };
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put({
      id: 'current',
      handle,
      projectPath,
      timestamp: Date.now(),
    });
  };
};

export const storeElectronFolderPath = (folderPath: string) => {
  currentElectronFolderPath = folderPath;
  currentProjectPath = folderPath;
};

export const storeTauriProjectPath = (folderPath: string) => {
  currentTauriProjectPath = folderPath;
  currentProjectPath = folderPath;
};

export const getElectronFolderPath = (): string => currentElectronFolderPath;

export const getFileContent = async (filePath: string): Promise<string | null> => {
  // Tauri: read via fs plugin with absolute path
  if (isTauri()) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const base = currentTauriProjectPath || currentProjectPath;
      // If filePath is already absolute, use it directly
      const isAbsolute = filePath.startsWith('/') || /^[A-Z]:/i.test(filePath);
      const absolutePath = isAbsolute ? filePath : `${base}/${filePath}`;
      return await readTextFile(absolutePath);
    } catch {
      return null;
    }
  }

  if (isElectron()) {
    const folder = currentElectronFolderPath;
    if (folder) {
      return window.electronAPI!.readRelativeFile(folder, filePath);
    }
    return null;
  }

  if (!currentDirectoryHandle) {
    const restored = await restoreDirectoryHandle();
    if (!restored) return null;
  }

  try {
    const parts = filePath.split('/').filter(Boolean);
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = currentDirectoryHandle!;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        const fileHandle = await (currentHandle as FileSystemDirectoryHandle).getFileHandle(part);
        const file = await fileHandle.getFile();
        return await file.text();
      } else {
        currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(part);
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const restoreDirectoryHandle = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const request = indexedDB.open('archy-fs', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('handles')) { resolve(false); return; }
      const tx = db.transaction('handles', 'readonly');
      const getReq = tx.objectStore('handles').get('current');
      getReq.onsuccess = () => {
        const result = getReq.result;
        if (result?.handle) {
          currentDirectoryHandle = result.handle;
          currentProjectPath = result.projectPath;
          resolve(true);
        } else {
          resolve(false);
        }
      };
      getReq.onerror = () => resolve(false);
    };
    request.onerror = () => resolve(false);
  });
};

export const getCurrentProjectPath = (): string => currentProjectPath;

export const hasDirectoryHandle = (): boolean =>
  isTauri() ? !!currentTauriProjectPath :
  isElectron() ? !!currentElectronFolderPath : currentDirectoryHandle !== null;

export const getFileInfo = async (filePath: string): Promise<{ size: number; lastModified: number } | null> => {
  if (isElectron() || !currentDirectoryHandle) return null;
  try {
    const parts = filePath.split('/').filter(Boolean);
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = currentDirectoryHandle;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        const fileHandle = await (currentHandle as FileSystemDirectoryHandle).getFileHandle(part);
        const file = await fileHandle.getFile();
        return { size: file.size, lastModified: file.lastModified };
      } else {
        currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(part);
      }
    }
    return null;
  } catch {
    return null;
  }
};
