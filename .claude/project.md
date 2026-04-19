# Archy — Project Overview

## What is Archy?

Archy is a visual architecture canvas for Python backend projects. It parses codebases using Python's `ast` module, detects framework patterns (Django, FastAPI, Flask), and renders an interactive graph showing modules, classes, routes, and their relationships.

## Architecture

- **Monorepo**: `frontend/` (React + Vite + TypeScript) and `backend/` (FastAPI + Python)
- **Frontend**: React 19, ReactFlow (@xyflow/react), Zustand for state, Tailwind CSS
- **Backend**: FastAPI, pydantic-settings for config, httpx for AI calls
- **AI**: OpenRouter as LLM gateway — optional, all core features work without it
- **Persistence**: IndexedDB for saved projects (frontend), in-memory deque for runtime events (backend)
- **DB inspection**: stdlib `sqlite3` only — no ORM, no external DB drivers

## Key Entry Points

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `backend/app/main.py` | FastAPI app, CORS, router registration |
| Backend | `backend/app/config.py` | Settings from `.env` via pydantic-settings |
| Backend | `backend/app/routers/registry.py` | Centralized router imports |
| Frontend | `frontend/src/main.tsx` | React entry point |
| Frontend | `frontend/src/pages/CanvasPage.tsx` | Main canvas — graph, panels, navbar |
| Frontend | `frontend/src/pages/HomePage.tsx` | Project picker / landing |
| Frontend | `frontend/src/store/useGraphStore.ts` | Zustand store for nodes/edges/framework |

## Data Flow

```
Browser (File System Access API)
  → reads directory tree
  → sends file contents to backend

Backend (FastAPI)
  → AST parses every .py file
  → detects framework patterns
  → extracts relationships (FK, M2M, admin, URL, inheritance)
  → returns { nodes, edges, metrics, insights }

Frontend (ReactFlow)
  → renders interactive graph
  → layout engine positions nodes
  → panels for file detail, AI brain, security, runtime
```

## Running Locally

```bash
# Backend
python -m venv .venv && .venv\Scripts\activate
pip install -r backend/requirements.txt
python backend/dev_server.py

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 in a Chromium browser.
