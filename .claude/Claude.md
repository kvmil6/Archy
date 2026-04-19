# Archy — AI Project Context

## What is Archy?

Archy is a visual architecture canvas tool for Python backend projects. It analyzes codebases using AST parsing and AI, then renders an interactive graph showing modules, classes, routes, and their relationships. It also features an AI Brain for Q&A, a security scanner, database schema visualization, and file-level deep analysis.

## Architecture Philosophy

- **Monorepo**: `frontend/` (React + Vite) + `backend/` (FastAPI)
- **Separation of concerns**: the frontend handles all UI state; the backend is a pure API layer
- **AI-first**: nearly every analysis feature is backed by OpenRouter (LLM gateway)
- **Graph-native**: all project structure is expressed as nodes and edges for ReactFlow
- **Zero auto-open**: never trigger VSCode or any external tool without explicit user action

## Key Constraints

1. Never open VSCode automatically — only on explicit user button click
2. Never store sensitive data (API keys) in localStorage — use backend `.env` only
3. Always normalize file paths to absolute on the backend before any subprocess call
4. All canvas mutations go through Zustand store (`useGraphStore`)
5. Streaming responses use `text/event-stream` (Server-Sent Events) via `stream_openrouter`
6. IndexedDB is the persistence layer for saved projects (via `projectManager.ts`)

## Session History

- **Session 1**: Canvas engine, ReactFlow setup, sidebar, file tree, basic analysis
- **Session 2**: Command palette, framework detection, .env scanning, database detection
- **Session 3**: AI Brain chat panel, project management (IndexedDB), security scanning (regex), ProjectSwitcher
- **Session 4**: Canvas auto-save, recent projects on homepage, full clean build
- **Session 5**: Navbar polish, command palette CSS fix, canvas UX improvements, AI-powered security scan with HTML report, VSCode path fix, AI Brain context upgrade, comment removal, .claude/ docs

## Rules for AI Assistants

- Read `backend.md` for backend endpoint reference before modifying any router
- Read `frontend.md` for component props and store shape before modifying frontend files
- Never add docstrings, comments, or type annotations to code you didn't change
- Never open VSCode programmatically — only on explicit user action
- Prefer editing existing files over creating new ones
- When modifying ReactFlow, always test with `npm run build` (use `cmd /c "cd frontend && npm run build"` on Windows)
