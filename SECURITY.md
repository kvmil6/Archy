# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | ✅ Active |
| `dev` branch | ✅ Active (pre-release) |
| Older snapshots | ❌ |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately by:

1. Opening a [GitHub private security advisory](https://github.com/kvmil6/Archy/security/advisories/new) (preferred), or
2. Contacting the maintainer directly via the GitHub profile at [@kvmil6](https://github.com/kvmil6)

Include as much of the following as possible:

- Affected component (backend router, service, frontend, etc.)
- Steps to reproduce
- Expected vs actual behavior
- Potential impact assessment
- Suggested mitigation if you have one

You will receive an acknowledgement within 48 hours. We aim to triage and release a fix within 14 days for critical issues.

---

## Secret and Credential Handling

- Never commit `.env` files, API keys, tokens, or database credentials
- Use `.env.example` as the reference template — it must never contain real values
- If you accidentally expose a secret in a commit, rotate it immediately and contact the maintainer so we can scrub the history

---

## Branch Security Model (`main`, `dev`, `feature/*`)

- `feature/*`: all new work starts here
- `dev`: integration and verification branch
- `main`: release-only branch

Allowed merge flow:

1. `feature/*` -> `dev`
2. `dev` -> `main`

Direct merges from `feature/*` to `main` are not allowed.

---

## Main Branch Hardening Checklist

In GitHub branch protection/rulesets for `main`, enable:

- Require pull request before merge
- Require at least one approval
- Require CODEOWNERS review
- Dismiss stale approvals on new commits
- Require status checks: `CI / Enforce Branch Flow`, `CI / Backend Validate`, `CI / Frontend Validate`, `CI / Security Guardrails`
- Require conversation resolution
- Restrict push access to maintainers only
- Disable force-push and branch deletion

For `dev`, keep lighter protection but still require PR + status checks.

---

## Visibility and Access Note

On a public GitHub repository, `main` cannot be hidden from view. If you need `main` to be truly private/non-visible, the repository must be private.

---

## Scope

This project is a **local-first developer tool**. The attack surface is:

- The FastAPI backend running on `localhost` — it is not designed to be exposed to the internet
- OpenRouter API key stored in a local `.env` file
- File System Access API access to local files (browser-sandboxed)

Archy does not have user accounts, a database of user data, or any cloud infrastructure. There is no production server to compromise.

---

## Out of Scope

- Issues in third-party dependencies (report to the relevant upstream project)
- Denial-of-service against a local dev server
- Social engineering
