# Archy — Conventions

## General Rules

1. Never open VS Code programmatically — only on explicit user button click
2. Never store API keys in localStorage — backend `.env` only
3. Always normalize file paths to absolute on the backend before any subprocess call
4. All canvas state mutations go through Zustand (`useGraphStore`)
5. Streaming AI responses use SSE (`text/event-stream`) via `stream_openrouter()`
6. IndexedDB is the persistence layer for saved projects (via `projectManager.ts`)

## Code Style

- **Python**: No docstrings on functions unless they're public API endpoints. Use type hints on function signatures. Use `logging.getLogger(__name__)` for logs.
- **TypeScript**: Functional components only. No class components. Use `interface` over `type` for component props. Tailwind for styling — no CSS modules.
- **Imports**: Group stdlib → third-party → local. No wildcard imports.

## Backend Conventions

- One router per domain (e.g., `brain.py` for AI, `editor.py` for editor integration)
- All routers registered in `routers/registry.py`
- Settings read from `.env` via pydantic-settings (`app/config.py`)
- API key read pattern: `os.environ.get('OPENROUTER_API_KEY') or settings.OPENROUTER_API_KEY`
- Path resolution: always use `os.path.normpath()` + `os.path.isabs()` checks

## Frontend Conventions

- State that affects the graph canvas lives in `useGraphStore` (Zustand)
- Panel open/close state lives as local `useState` in `CanvasPage.tsx`
- Backend URL from `apiClient.ts` → `BACKEND_URL` constant
- File reading uses the File System Access API (`fileSystem.ts`)
- Toast notifications via `useToast()` hook
- Design tokens in `styles/design.ts` — use CSS variables (`var(--color-*)`)

## Naming

- Backend routers: `routers/{domain}.py` with `router = APIRouter(prefix="/{domain}")`
- Frontend components: PascalCase files, one component per file
- Services: camelCase files in `services/`
- Types: all in `types/index.ts`

## Build & Test

- Frontend build: `cmd /c "cd frontend && npm run build"` (Windows)
- Frontend type check: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`
- Backend: `python backend/dev_server.py` (uvicorn with reload)
- CI: `.github/workflows/ci.yml` runs on push to `main` and `dev`
