# Archy Frontend

The frontend is a React + TypeScript canvas application focused on architecture visualization and developer workflows.

## Responsibilities

- Folder selection and file scanning with the File System Access API
- Graph rendering with React Flow
- Canvas interactions, search, filtering, tracing, and layout controls
- AI Brain, deep file insight, and security panel UX
- Runtime insights panel for analysis/layout/editor activity visibility

## Boundary with Backend

- Frontend owns state and interaction flow
- Backend owns parsing, graph computation, AI orchestration, and editor/runtime API endpoints
- Frontend should always call backend via `BACKEND_URL` from `src/services/apiClient.ts`

## Local Development

From repository root:

1. Install dependencies:
   - `cmd /c "cd frontend && npm install"`
2. Run dev server:
   - `cmd /c "cd frontend && npm run dev"`
3. Build for production validation:
   - `cmd /c "cd frontend && npm run build"`

## Key Directories

- `src/pages`: route-level pages
- `src/components`: UI and panels
- `src/services`: API and domain-specific frontend services
- `src/store`: Zustand graph state
- `src/utils`: graph/layout helpers

## Open-Source Contribution Notes

- Keep component APIs typed and stable
- Avoid hardcoded backend URLs
- Keep performance-sensitive UI updates batched and memoized
- Preserve responsive behavior for canvas controls and panels
