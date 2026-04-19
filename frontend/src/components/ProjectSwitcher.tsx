import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Clock,
  ChevronRight,
  Archive,
} from 'lucide-react';
import {
  listProjects,
  deleteProject,
  renameProject,
  type SavedProject,
} from '@/services/projectManager';

interface ProjectSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (project: SavedProject) => void;
  onNew: () => void;
  currentProjectId?: string;
}

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  isOpen,
  onClose,
  onSelect,
  onNew,
  currentProjectId,
}) => {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) loadProjects();
  }, [isOpen]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (e) {
      console.error('Failed to load projects', e);
    }
    setLoading(false);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renameProject(id, editName.trim());
    setEditingId(null);
    loadProjects();
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setConfirmDeleteId(null);
    loadProjects();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <Archive className="w-4.5 h-4.5" style={{ color: 'var(--color-accent)' }} />
            <span className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>Projects</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-md font-mono" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
              {projects.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors hover:opacity-90"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-6 h-6 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin mx-auto" />
            </div>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center">
              <FolderOpen className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-text-faint)' }} />
              <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>No saved projects yet</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-faint)' }}>
                Open a folder and analyze it — it will appear here
              </p>
            </div>
          ) : (
            projects.map((project) => {
              const isCurrent = project.id === currentProjectId;
              return (
                <div
                  key={project.id}
                  className={`group px-5 py-3 border-b transition-colors cursor-pointer hover:bg-white/[0.03] ${
                    isCurrent ? 'bg-white/[0.04] border-l-2' : ''
                  }`}
                  style={{
                    borderColor: 'var(--color-border)',
                    borderLeftColor: isCurrent ? 'var(--color-accent)' : 'transparent',
                  }}
                  onClick={() => {
                    if (!editingId && !confirmDeleteId) onSelect(project);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      {editingId === project.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(project.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="px-2 py-1 text-[13px] rounded border bg-transparent focus:outline-none"
                            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-text)' }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRename(project.id); }}
                            className="p-1 rounded hover:bg-white/10"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                            className="p-1 rounded hover:bg-white/10"
                          >
                            <X className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                              {project.name}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                                    style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
                                active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-faint)' }}>
                              {project.projectPath || 'No path'}
                            </span>
                            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-faint)' }}>
                              <Clock className="w-2.5 h-2.5" />
                              {formatDate(project.updatedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {project.framework && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                                {project.framework}
                              </span>
                            )}
                            <span className="text-[9px]" style={{ color: 'var(--color-text-faint)' }}>
                              {project.files?.length || 0} files · {project.nodes?.length || 0} nodes
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    {!editingId && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(project.id);
                            setEditName(project.name);
                          }}
                          className="p-1.5 rounded hover:bg-white/10 transition-colors"
                          title="Rename"
                        >
                          <Edit3 className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                        </button>
                        {confirmDeleteId === project.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                              className="px-2 py-1 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                            >
                              Delete
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                              className="p-1 rounded hover:bg-white/10"
                            >
                              <X className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(project.id); }}
                            className="p-1.5 rounded hover:bg-white/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                          </button>
                        )}
                        <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--color-text-faint)' }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t text-[10px] font-mono" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}>
          Projects stored locally in browser · not synced
        </div>
      </div>
    </div>
  );
};
