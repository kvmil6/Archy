# Branch Governance and Protection

This document defines the required GitHub branch workflow for Archy.

## Required Branch Model

- main: production/stable branch
- dev: integration branch
- feature/*, fix/*, hotfix/*: short-lived work branches

Required merge flow:

1. feature/* -> dev
2. dev -> main

Direct pushes to main are disallowed.

## First-Time Repository Bootstrap (Maintainers)

If the repository has no commits yet, create the baseline commit first, then create dev.

```bash
git add .
git commit -m "chore: initialize repository"
git branch dev
git push -u origin main
git push -u origin dev
```

## GitHub Ruleset Configuration

Configure these in GitHub Settings -> Rules -> Rulesets.

### Main Ruleset (strict)

Target: main

Enable:

- Restrict direct pushes to main (maintainers only, or no one)
- Require pull request before merging
- Require at least 1 approval
- Require CODEOWNERS review
- Dismiss stale approvals when new commits are pushed
- Require conversation resolution
- Require status checks
- Block force pushes
- Block branch deletion

Required status checks:

- CI / Enforce Branch Flow
- CI / Backend Validate
- CI / Frontend Validate
- CI / Security Guardrails

### Dev Ruleset (integration)

Target: dev

Enable:

- Require pull request before merging
- Require status checks
- Block force pushes
- Block branch deletion

Recommended required checks for dev:

- CI / Enforce Branch Flow
- CI / Backend Validate
- CI / Frontend Validate
- CI / Security Guardrails

## CI Branch Guard

The CI workflow enforces release-flow policy:

- Pull requests into main are only allowed from dev
- CI runs on pushes to main/dev and PRs targeting main/dev

Policy file: .github/workflows/ci.yml
