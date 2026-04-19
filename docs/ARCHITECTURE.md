# Archy Architecture

## Monorepo Layout

- frontend: React + TypeScript + React Flow canvas and UX panels
- backend: FastAPI services for parsing, analysis, AI orchestration, and runtime telemetry

## Backend Layers

- parser layer: Python AST parsing and graph extraction
- analyzer layer: metrics, relationships, and architecture insights
- graph engine layer: orchestration and layer profile generation
- AI layer: chat, deep file analysis, and security summaries
- runtime layer: activity tracking and execution visibility

## Framework Detection

Framework detection is plugin-based.

- `DjangoPlugin`
- `FastAPIPlugin`
- `FlaskPlugin`

The detector aggregates weighted signals and returns framework, confidence, runner-up, and evidence.

## API Boundaries

- `/parser/analyze-project`: graph + metrics + insights + framework detection
- `/brain/chat`: AI Q&A with runtime project context and markdown knowledge context
- `/file-insight/analyze`: deep file architecture analysis
- `/runtime/events` and `/runtime/summary`: runtime activity stream and summary

## Frontend Boundaries

- File scanning and canvas state remain frontend-owned
- Backend is called only through API services
- Runtime insights panel visualizes backend/runtime event stream

## Design Constraints

- Keep file paths normalized before backend subprocess calls
- Keep editor opening user-initiated
- Keep AI prompts reusable via template files in `backend/app/prompts`
