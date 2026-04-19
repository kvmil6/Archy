# Archy — Roadmap

## Near-term

- [ ] PostgreSQL / MySQL live inspection (via `psycopg` / `mysqlclient`)
- [ ] SQLAlchemy + Alembic model extraction
- [ ] FastAPI dependency injection graph visualization
- [ ] Watch mode — re-parse on file save (file system watcher)

## Mid-term

- [ ] Architecture diff — compare two graph snapshots, useful in CI
- [ ] CLI tool: `archy scan ./myproject --json` for headless analysis
- [ ] Graph bookmarks — save and restore specific graph views

## Long-term

- [ ] VS Code extension — embed the graph in the editor sidebar
- [ ] Plugin API — custom node/edge types for domain-specific visualization
- [ ] Multi-language support — JS/TS project parsing

## Completed

- [x] Canvas engine with ReactFlow, sidebar, file tree
- [x] Command palette, framework detection, .env scanning, database detection
- [x] AI Brain chat panel, project management (IndexedDB), security scanning
- [x] Canvas auto-save, recent projects on homepage
- [x] Multiple graph layout modes (hierarchical, radial, tree, force, hub)
- [x] Static OWASP security scanner (ast + re, no external deps)
- [x] Runtime insights panel with environment info
- [x] Data flow tracing (Alt+click)
- [x] Export to SVG/PNG/JSON
