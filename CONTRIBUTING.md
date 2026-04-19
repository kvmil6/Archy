# Contributing to Archy

Thank you for your interest in contributing. Archy is a local-first, open-source architecture visualization tool for Python backends. All contributions — bug reports, feature requests, documentation improvements, and code — are welcome.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [First-Time Bootstrap](#first-time-bootstrap-maintainers)
- [Branch Workflow](#branch-workflow)
- [Repository Protection](#repository-protection)
- [Making Changes](#making-changes)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Code Standards](#code-standards)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Getting Started

### Good first issues

Issues labelled [`good first issue`](https://github.com/kvmil6/Archy/issues?q=label%3A%22good+first+issue%22) are small, well-scoped, and have clear acceptance criteria. They are the best starting point if you are new to the codebase.

### Areas that need help

- New framework support (e.g. SQLAlchemy, Tornado, Starlette)
- Database inspector improvements (PostgreSQL, MySQL)
- Frontend UX refinements
- Documentation and examples
- Test coverage

---

## Development Setup

### Prerequisites

- Python 3.10+
- Node 20+
- Rust (install via [rustup.rs](https://rustup.rs)) — required for Tauri desktop builds
- Git

> **Web mode only?** You can develop without Rust by running the backend and frontend separately. See steps 7–8 below.

### Steps

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Archy.git
cd Archy

# 2. Add the upstream remote
git remote add upstream https://github.com/kvmil6/Archy.git

# 3. Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# 4. Install backend dependencies
pip install -r backend/requirements.txt

# 5. Install frontend dependencies
cd frontend
npm install
cd ..

# 6. Copy the environment template
cp .env.example .env
# Optionally add your OPENROUTER_API_KEY for AI features

# 7. Start the desktop app (starts backend + frontend automatically)
cd frontend
npx tauri dev

# OR: run without Tauri (web mode)
# Terminal 1: python backend/dev_server.py
# Terminal 2: cd frontend && npm run dev
```

Open **http://localhost:5173** (web mode) or the Tauri window will appear automatically.

---

## First-Time Bootstrap (Maintainers)

If this repository has no commits yet, create the baseline commit first, then create and push `dev`.

```bash
git add .
git commit -m "chore: initialize repository"
git branch dev
git push -u origin main
git push -u origin dev
```

After pushing both branches, configure GitHub rulesets described in `docs/BRANCH_GOVERNANCE.md`.

---

## Branch Workflow

| Branch | Purpose |
|---|---|
| `main` | Stable release branch. Only receives merges from `dev`. |
| `dev` | Integration branch. Receives reviewed feature/fix PRs. |
| `feature/*` | New work branch created from `dev` (`feature/`, `fix/`, `hotfix/`, etc.). |

**Required flow:**

1. Create your work branch from `dev`
2. Open PR from `feature/*` into `dev`
3. After validation, open PR from `dev` into `main`

Never commit directly to `main`, and avoid direct commits to `dev`.

**Day-to-day commands:**

```bash
# Switch to dev before starting any work
git switch dev

# Pull the latest changes
git pull upstream dev

# Create a focused feature branch
git switch -c feat/my-improvement

# Implement and test your changes
# ...

# Push and open a PR targeting dev
git push origin feat/my-improvement
```

Feature PRs must target `dev`. Release PRs target `main` only from `dev`.

---

## Repository Protection

Configure these in GitHub branch protection and rulesets.

For the full policy and maintainer checklist, see `docs/BRANCH_GOVERNANCE.md`.

### `main` protection (strict)

- Require a pull request before merging
- Require at least 1 approval
- Require review from CODEOWNERS
- Dismiss stale approvals on new commits
- Require all required status checks to pass
- Require conversation resolution before merge
- Restrict who can push to `main`
- Block force pushes and branch deletion

### `dev` protection (integration)

- Require pull request before merging
- Require status checks to pass
- Block force pushes and branch deletion

### Required checks to mark in GitHub

- `CI / Enforce Branch Flow`
- `CI / Backend Validate`
- `CI / Frontend Validate`
- `CI / Security Guardrails`

---

## Making Changes

### Backend

The backend is a FastAPI application in `backend/app/`. Key directories:

- `routers/` — one file per domain (`parser.py`, `brain.py`, `editor.py`, …)
- `services/` — business logic (keep routers thin)
- `schemas/` — Pydantic models for request/response validation

### Frontend

The frontend is a React + TypeScript app in `frontend/src/`. Key directories:

- `pages/` — top-level page components (`CanvasPage.tsx`, `HomePage.tsx`)
- `components/` — reusable UI components
- `store/useGraphStore.ts` — all canvas state (Zustand)
- `services/` — API calls and local utilities

**Important constraints:**

- Never open VS Code or any external tool programmatically — only on explicit user action
- All canvas mutations must go through `useGraphStore`
- Never store API keys in `localStorage` — use the backend `.env` only
- Streaming responses use `text/event-stream` (SSE)

### Validate your changes

```bash
# Frontend — must pass before opening a PR
cd frontend
npm run build

# Backend — basic import check
python -m compileall backend/app
```

---

## Pull Request Guidelines

1. **Feature/fix PRs target `dev`**. Only release PRs (`dev` -> `main`) target `main`.
2. Use a descriptive title following the format: `type: short description`
   - `fix: correct edge rendering for M2M fields`
   - `feat: add PostgreSQL schema inspector`
   - `docs: update quick start instructions`
3. Fill in the PR template — motivation, what changed, how to test.
4. Ensure the frontend build passes (`npm run build`).
5. Keep PRs focused. One feature or fix per PR is easier to review.
6. If your PR closes an issue, include `Closes #123` in the description.

---

## Code Standards

### Python

- Follow PEP 8
- Keep functions short and single-purpose
- No unused imports
- No commented-out code

### TypeScript / React

- Use strict typing; avoid `any` unless truly unavoidable
- Keep components focused — split when a component exceeds ~200 lines
- Use Tailwind utility classes consistently
- No inline event handlers for complex logic — extract named handlers

### Both

- Do not add docstrings, comments, or type annotations to code you did not change
- Do not introduce new dependencies without discussion
- Never commit `.env` files, API keys, or credentials

---

## Reporting Bugs

Use the [bug report template](https://github.com/kvmil6/Archy/issues/new?template=bug_report.yml).

Please include:

- OS and browser
- Steps to reproduce
- Expected vs actual behavior
- Any relevant console errors

---

## Suggesting Features

Use the [feature request template](https://github.com/kvmil6/Archy/issues/new?template=feature_request.yml).

Before opening, check [existing issues](https://github.com/kvmil6/Archy/issues) to avoid duplicates. For large features, open a discussion first to align on scope before writing code.
