<div align="center">

<img src="frontend/public/logo.svg" width="96" alt="Archy logo" />

<h1>Archy</h1>

<p><strong>AI-powered architecture visualization for Python backends.</strong></p>

<p>
Open any Django, FastAPI, or Flask project and instantly see every module,<br/>
model, route, and relationship as an interactive graph — no config required.
</p>

[![CI](https://github.com/kvmil6/Archy/actions/workflows/ci.yml/badge.svg)](https://github.com/kvmil6/Archy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-7c86ff?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-3776ab?style=flat-square&logo=python&logoColor=white)](#requirements)
[![Node](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](#requirements)
[![Local First](https://img.shields.io/badge/local--first-no%20telemetry-22d3ee?style=flat-square)](#privacy)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

<br/>

[**Quick Start**](#quick-start) · [**Features**](#features) · [**How It Works**](#how-it-works) · [**Roadmap**](#roadmap) · [**Contributing**](CONTRIBUTING.md)

</div>

---

## Why Archy?

Most architecture tools are either diagram editors (you draw it manually) or dependency graphs (just imports). Archy is different: it **understands your code semantically** using Python's own `ast` module and maps it to the specific patterns of your framework.

| | Archy | Dependency graphs | Manual diagrams |
|---|---|---|---|
| Real AST parsing | ✅ | ✅ | ❌ |
| Framework-aware (Django/FastAPI/Flask) | ✅ | ❌ | ❌ |
| Model relationships with field names | ✅ | ❌ | ❌ |
| AI Q&A about your codebase | ✅ | ❌ | ❌ |
| Live database schema | ✅ | ❌ | ❌ |
| Data flow tracing | ✅ | ❌ | ❌ |
| No account / no upload | ✅ | varies | varies |

---

## Demo

> Open a project, get an instant graph. Click any node to inspect.

```
┌───────── nav ─────────────────────────────────────────────────────────────────┐
│ Archy / myproject / django    Runtime  Export  ⌘K Commands  ↻  AI Brain  ...  │
├──────── sidebar ──────┬──────────────────────── canvas ───────────────────────┤
│ EXPLORER              │                                                        │
│ 127 files · 34 .py    │     ┌─────┐              ┌─────────┐                  │
│                       │     │User │──FK──────────▶│  Post   │                  │
│ ▸ 📁 blog (23)        │     └─────┘              └─────────┘                  │
│ ▸ 📁 users (12)       │        ▲                      ▲                       │
│ ▸ 📁 api (8)          │        │                      │                       │
│ ▾ 📁 mysite           │  ┌─────────────┐       ┌──────────┐                   │
│   📄 settings.py CONF │  │  UserAdmin  │       │  urls.py │──routes──┐        │
│   📄 urls.py    URL   │  └─────────────┘       └──────────┘          ▼        │
│                       │                                     ┌──────────────┐  │
│ ▸ 📁 templates        │                                     │ PostListView │  │
│                       │                                     └──────────────┘  │
└───────────────────────┴────────────────────────────────────────────────────────┘
  ready · 47 nodes · 72 edges · 12 models · 8 routes · cx 142 · kimi-k2.5 · Py AST
```

---

## Features

### Real semantic parsing — not regex, not guesswork

Archy uses Python's native `ast` module — the same parser Python itself uses — so it understands your code the same way the interpreter does.

- **Framework-aware**: knows `models.Model`, DRF `ModelSerializer`, FastAPI routers, Flask blueprints
- **Relationship extraction**: `ForeignKey`, `ManyToManyField`, `OneToOneField`, admin registrations, `urls.py` patterns, `Meta.model`, `INSTALLED_APPS`
- **Class inheritance chains** across files

### Architecture insights — things other tools miss

| Insight | What it catches |
|---|---|
| **Circular dependencies** | Modules that import each other (DFS over the import graph) |
| **Complexity hotspots** | Files with high cyclomatic complexity, ranked |
| **Orphan files** | Files not imported anywhere — candidates for deletion |
| **God classes** | Classes with more than 20 methods |
| **Cluttered models** | `models.py` files with too many models — suggests a domain split |

### AI Brain — ask anything about your codebase

An embedded AI assistant with full graph context. Ask things like:

> *"Why is UserSerializer coupled to AuthMiddleware?"*  
> *"What is the fastest path from an HTTP request to the database?"*  
> *"Which model has the most dependents and is a refactoring risk?"*

Works with any model via [OpenRouter](https://openrouter.ai) — Claude, GPT-4, Kimi, Qwen, Llama, Gemma. **AI is optional**: all parsing and graph features work 100% locally without a key.

### Live database inspection

- Auto-detects `db.sqlite3` / `*.sqlite` / `*.db` in your project
- Reads live schema: tables, columns, foreign keys, indexes, row counts
- Identifies many-to-many junction tables by column heuristics
- Links Python model classes to their underlying DB tables
- Uses only stdlib `sqlite3` — zero extra dependencies

### Data flow tracing

`Alt`+click any node to highlight the complete upstream or downstream chain. Non-traced nodes dim; traced edges animate. A status overlay shows the path:

```
Route:/users → Controller:UserView → Model:User → Table:blog_user
```

### File detail panel

Click any node to open a three-tab panel:

- **Overview** — classes, methods, functions with complexity scores, imports
- **Source** — syntax-highlighted file content with a one-click copy
- **AI Analysis** — structured deep analysis: purpose, patterns, risks, refactoring suggestions

### Export in three formats

| Format | Use case |
|---|---|
| **SVG** | Scalable vector — embed in docs or Notion |
| **PNG** | 2× retina — share in Slack or issues |
| **JSON** | Machine-readable — diff architectures in CI |

### Keyboard-first UX

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘F` / `/` | Find any node |
| `Alt` + click | Trace data flow from node |
| `⌘R` | Re-analyze project |
| `⌘B` | Toggle AI Brain |
| `⌘E` | Export architecture prompt |
| `⌘I` | Toggle insights panel |
| `F` | Fit graph to viewport |
| `Esc` | Close panels / clear trace |

---

## How It Works

```
1. SELECT PROJECT FOLDER
   ↓ Tauri native dialog (desktop) or Browser File System Access API (web)
   ↓ Directory tree read locally (nothing uploaded)

2. BACKEND PARSES WITH AST
   ↓ FastAPI server runs Python's ast module on every .py file
   ↓ Framework patterns detected (Django / FastAPI / Flask)
   ↓ Relationships, imports, complexity scores extracted

3. GRAPH BUILT
   ↓ Nodes: models, controllers, routes, schemas, modules
   ↓ Edges: FK/M2M, admin registration, URL wiring, inheritance, imports

4. CANVAS RENDERED
   ↓ React Flow renders the interactive graph
   ↓ Auto-layout positions nodes by type and relationship

5. OPTIONAL AI LAYER
   ↓ AI Brain and file analysis stream from OpenRouter
   ↓ Prompts are constructed from AST facts — not raw source code dumps
```

---

## Quick Start

### Requirements

- **Python 3.10+**
- **Node 20+**
- **Rust** (install via [rustup.rs](https://rustup.rs)) — required for Tauri desktop builds

> **Web mode only?** If you just want to run Archy in a Chromium browser (Chrome, Edge, Brave), you don't need Rust. See [Web Mode](#web-mode) below.

### Desktop App (Tauri)

```bash
# 1. Clone the repository
git clone https://github.com/kvmil6/Archy.git
cd Archy

# 2. Set up the Python backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r backend/requirements.txt

# 3. Install frontend dependencies
cd frontend
npm install

# 4. Run the desktop app (starts backend + frontend automatically)
npx tauri dev
```

To build a distributable binary:
```bash
cd frontend
npx tauri build
```

### Web Mode

Run without Tauri in any Chromium browser:

```bash
# Terminal 1: Start the backend
python backend/dev_server.py

# Terminal 2: Start the frontend
cd frontend && npm run dev
```

Open **http://localhost:5173** and click **Select project folder** to load any Python project.

> **Note:** Web mode requires a Chromium browser (Chrome, Edge, Brave) for the File System Access API. Firefox and Safari are not supported in web mode.

### Downloads

Pre-built binaries are available on the [Releases](https://github.com/kvmil6/Archy/releases) page:

| Platform | Format |
|---|---|
| Windows | `.exe` (NSIS installer) |
| macOS | `.dmg` |
| Linux | `.AppImage`, `.deb` |

### Enable AI (optional)

Copy `.env.example` to `.env` and add your OpenRouter key:

```bash
cp .env.example .env
# then edit .env:
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Get a free key at [openrouter.ai](https://openrouter.ai). Archy detects it automatically and shows **AI READY** in the nav. You can also paste it directly in the UI — it writes to `.env` for you.

---

## Project Structure

```
Archy/
├── backend/                  # FastAPI server
│   ├── app/
│   │   ├── main.py           # App entry point, CORS, router registry
│   │   ├── config.py         # Settings loaded from .env
│   │   ├── routers/          # One router per domain (parser, brain, editor…)
│   │   ├── services/         # Business logic (AST parser, AI, db inspector…)
│   │   ├── parsers/          # AST → graph prompt converters
│   │   └── schemas/          # Pydantic request/response models
│   ├── dev_server.py         # Development entrypoint (uvicorn + reload)
│   └── requirements.txt
├── frontend/                 # React + Vite + TypeScript
│   ├── src/
│   │   ├── pages/            # CanvasPage, HomePage
│   │   ├── components/       # All UI components
│   │   ├── services/         # API client, project manager, graph export
│   │   ├── store/            # Zustand graph store
│   │   └── types/            # Shared TypeScript types
│   └── src-tauri/            # Tauri desktop shell (Rust)
│       ├── src/lib.rs         # App setup, backend auto-start
│       ├── tauri.conf.json    # Window size, bundle config
│       └── capabilities/      # Permission grants (dialog, fs, shell)
├── .env.example              # Environment variable template
├── .github/
│   ├── workflows/ci.yml      # CI: branch flow, validation, and security checks
│   ├── CODEOWNERS
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/                     # Architecture and project documentation
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

---

## Privacy

Archy is **local-first**:

- File contents never leave your machine unless you explicitly run AI analysis
- AI requests go directly: your backend → OpenRouter → back to you
- No telemetry, no analytics, no accounts, no data collection
- Your `.env` stays on your disk

---

## Node & Edge Reference

### Node types

| Type | Color | Represents |
|---|---|---|
| `model` | green | Django model / SQLAlchemy / Pydantic table |
| `controller` | indigo | Django view, DRF ViewSet, FastAPI route class |
| `route` | violet | Function-based endpoint / `@router.get` |
| `schema` | amber | DRF serializer / Pydantic schema |
| `repository` | orange | Data access layer |
| `service` | blue | Business logic / admin |
| `domain` | rose | Domain entity |
| `module` | emerald | Structural file (settings, urls, admin) |

### Edge types

| Edge | Color | Meaning |
|---|---|---|
| **Inheritance** | slate | `class Child(Parent)` |
| **FK / M2M / 1:1** | cyan | Django model relations (animated) |
| **Admin** | orange dashed | `admin.site.register()` |
| **Route** | violet | `path('', MyView.as_view())` |
| **Settings → app** | amber dashed | `INSTALLED_APPS` |
| **Migration** | slate dotted | Migration file → model it migrates |
| **Serializes** | green | `class Meta: model = X` |
| **Import** | slate dashed | Generic import fallback |

---

## Roadmap

### Near-term

- [ ] PostgreSQL / MySQL live inspection (via `psycopg` / `mysqlclient`)
- [ ] SQLAlchemy / Alembic model extraction
- [ ] FastAPI dependency injection graph
- [ ] Watch mode — re-parse on file save

### Mid-term

- [ ] Graph layout variants (radial, tree, hierarchical)
- [ ] Security scanner — OWASP-pattern static analysis across the graph
- [ ] Architecture diff — compare two graph snapshots (useful in CI)
- [ ] CLI tool: `archy scan ./myproject --json`

### Long-term

- [ ] Collaboration mode — shared canvases via WebRTC
- [ ] VS Code extension — graph embedded in the editor sidebar
- [ ] Plugin API — extend with custom node/edge types

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, branch workflow, and pull request guidelines.
Maintainers should also configure GitHub branch rulesets using [docs/BRANCH_GOVERNANCE.md](docs/BRANCH_GOVERNANCE.md).

Issues labelled [`good first issue`](https://github.com/kvmil6/Archy/issues?q=label%3A%22good+first+issue%22) are a great starting point.

## Security

Please do not open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

---

## License

MIT — see [LICENSE](LICENSE) for details.

Built by [@kvmil6](https://github.com/kvmil6) · [Open an issue](https://github.com/kvmil6/Archy/issues/new/choose) · [Start a discussion](https://github.com/kvmil6/Archy/discussions)
