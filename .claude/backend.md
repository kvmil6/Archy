# Archy Backend — Architecture Reference

## Stack

- **Framework**: FastAPI (Python)
- **Settings**: `pydantic_settings` — reads from `.env` via `Settings` class in `app/config.py`
- **AI Gateway**: OpenRouter via `httpx` — base URL `https://openrouter.ai/api/v1`
- **Entry point**: `app/main.py` — registers all routers, CORS middleware, global exception handler
- **Run command**: `python backend/dev_server.py` (from repo root, VS Code friendly)

## Router Map

| Prefix | File | Purpose |
|--------|------|---------|
| `/analyze` | `routers/analyze.py` | Stream architectural insights from a ReactFlow graph |
| `/generate` | `routers/generate.py` | Boilerplate code generation (Phase 2 placeholder) |
| `/brain` | `routers/brain.py` | AI Brain — file analysis, chat, security scan |
| `/editor` | `routers/editor.py` | Open files in VS Code / Cursor / Windsurf |
| `/projects` | `routers/projects.py` | Project CRUD on disk |
| `/status` | `routers/status.py` | Health check + AI availability |
| `/config` | `routers/config.py` | Runtime API key injection |
| `/parser` | `routers/parser.py` | AST-based Python project graph builder |
| `/file-insight` | `routers/file_insight.py` | Deep streaming AI analysis of single file |
| `/database` | `routers/database.py` | SQLite inspection + auto-detect |
| `/advanced` | `routers/advanced.py` | Advanced analysis endpoints |
| `/git-info` | `routers/git_info.py` | Git log / blame info |
| `/runtime` | `routers/runtime.py` | Runtime activity event ingest + summary |

## Key Endpoints

### `POST /brain/analyze`
Reads Python file contents, runs AI analysis in batches of 5.
- Body: `{ files: [{path, content}], project_name? }`
- Returns: `{ analyses, relationship_graph, metrics }`

### `POST /brain/chat`
AI Q&A with project context.
- Body: `{ question, context: { files, metrics, graph, framework, project_name } }`
- Returns: `{ answer }`
- Model: first entry in `settings.AVAILABLE_MODELS`

### `POST /brain/security-scan`
Regex-based security scan + optional AI summary.
- Body: `{ files: [{path, content}], framework? }`
- Returns: `{ score, findings, summary }`

### `POST /editor/open`
Open a file in the user's editor.
- Body: `{ filepath, line?, column?, project_root?, editor? }`
- `project_root` is used to resolve relative paths
- Tries VS Code → Cursor → Windsurf (backend subprocess only)

### `POST /editor/open-project`
Open the selected project folder in the user's editor.
- Body: `{ project_path, editor? }`

### `POST /runtime/events`
Record frontend/backend runtime activity events.
- Body: `{ event_type, command, status, duration_ms?, source?, metadata? }`

### `GET /runtime/summary`
Return aggregate runtime activity metrics and recent events.

### `POST /database/inspect`
Inspect a SQLite file and return graph fragment.
- Body: `{ db_path, include_row_counts?, existing_class_labels? }`
- `db_path` must be absolute

### `POST /database/detect`
Walk a project directory for `.sqlite`/`.db` files.
- Body: `{ project_path }` (must be absolute)

### `POST /parser/analyze-project`
Full AST graph from Python source files.
- Body: `{ files: [{path, content}], exclude_migrations? }`
- Returns: `{ nodes, edges, metrics, insights, framework_detection, layer_profile }`

### `POST /parser/detect-framework`
Detect framework from project files.
- Body: `{ files: [{path, content}], exclude_migrations? }`
- Returns: `{ framework, confidence, runner_up, scores, signals }`

### `POST /file-insight/analyze`
Streaming deep analysis of a single file.
- Body: `{ filepath, content, model?, framework?, project_context? }`
- Returns: `text/event-stream`

## Service Layer

| File | Purpose |
|------|---------|
| `services/ai_brain.py` | `FileAnalysis` + `AIBrain` class — batch AI analysis |
| `services/openrouter.py` | `stream_openrouter()` — SSE streaming wrapper |
| `services/python_parser.py` | `PythonParser` + `build_project_graph()` — AST analysis |
| `services/db_inspector.py` | `SQLiteInspector` + `build_db_graph_fragment()` |
| `services/codegen.py` | Code generation helpers |
| `services/project_analyzer.py` | Project structure analyzer |
| `services/architecture_service.py` | Facade for graph engine + framework detection |
| `services/runtime_tracker.py` | In-memory runtime event recording + summaries |
| `services/prompt_library.py` | Prompt template loading and variable rendering |
| `services/markdown_knowledge.py` | Curated markdown context aggregation for AI prompts |

## Settings Reference (`app/config.py`)

```python
OPENROUTER_API_KEY: Optional[str]
OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
HOST: str = "0.0.0.0"
PORT: int = 8000
CORS_ORIGINS: str  # comma-separated list
ARCHY_LINK_PORT: int = 47291
AVAILABLE_MODELS: str  # comma-separated, first is default
```

## API Key Injection

The `/config/api-key` endpoint sets `os.environ['OPENROUTER_API_KEY']` at runtime.
All AI endpoints read: `os.environ.get('OPENROUTER_API_KEY') or settings.OPENROUTER_API_KEY`

## Path Safety

All file paths passed to subprocesses are validated in `editor.py`:
- Must be absolute OR resolved via `project_root`
- Normalized with `os.path.normpath()`
- Existence checked with `os.path.exists()`
