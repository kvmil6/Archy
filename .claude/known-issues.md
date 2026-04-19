# Archy — Known Issues

## Resolved

- **OpenRouter 404**: Default model list included deprecated IDs (`anthropic/claude-3.5-sonnet`, `anthropic/claude-3-opus`). Updated to valid models (`anthropic/claude-sonnet-4-5`, `openai/gpt-4o`, `google/gemini-2.0-flash-001`).
- **VS Code auto-open**: `editor.py` had a `vscode://` protocol fallback that triggered VS Code even when the user didn't click an editor button. Removed — now returns error if no editor CLI is found on PATH.
- **CI type check**: `npx tsc` downloaded wrong TypeScript version. Fixed to use `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`.

## Current Limitations

- **Browser support**: File System Access API only works in Chromium (Chrome, Edge, Brave). Firefox and Safari cannot open project folders.
- **Large projects**: Graph rendering slows above ~500 nodes. `onlyRenderVisibleElements` is enabled when `nodes.length > 80`.
- **DB inspection**: Only SQLite supported. PostgreSQL/MySQL inspection is not yet implemented.
- **Python only**: AST parser only handles Python files. No JS/TS/Go/Rust support.
- **Graph layout**: Auto-layout works but can produce cluttered results for highly connected codebases.
- **Security scanner**: Static regex-based — no data flow analysis or taint tracking. May produce false positives on commented-out code (mitigated by skipping `#` lines).

## Edge Cases

- If the backend is unreachable, the frontend falls back to a local quick-parse that lacks relationship extraction and complexity metrics.
- The `.env` file is searched in `backend/.env` then repo root `.env`. If neither exists, AI features are unavailable.
- `getFileContent()` requires a stored `FileSystemDirectoryHandle` — if the browser tab is restored without the handle, file reads fail silently.
