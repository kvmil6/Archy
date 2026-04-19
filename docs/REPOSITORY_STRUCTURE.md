# Repository Structure

This document defines the top-level layout for Archy and the responsibility of each area.

## Top-Level Layout

- backend: FastAPI API server, architecture parsing, AI services, and runtime integration.
- frontend: React + Vite UI, state management, and Tauri desktop shell.
- docs: Technical documentation, architecture notes, and contributor references.
- examples: Sample backend projects used for parser validation and demos.
- assets: Shared static assets and branding resources.

## Backend Conventions

- backend/app/routers: API boundary layer. Keep handlers small and delegate logic.
- backend/app/services: Business logic and integration code.
- backend/app/schemas: Pydantic contracts for request/response payloads.
- backend/app/architecture: AST and framework detection pipeline.
- backend/app/prompts: Prompt templates used by AI features.

## Frontend Conventions

- frontend/src/pages: Route-level pages.
- frontend/src/components: Reusable UI components.
- frontend/src/store: Zustand state stores; graph mutation source of truth.
- frontend/src/services: API calls and persistence helpers.
- frontend/src-tauri: Desktop shell, permissions, and packaging config.

## Scaling Guidelines

- Add new backend capabilities by creating a dedicated router + service pair.
- Keep framework-specific parsing isolated under backend/app/architecture.
- Keep UI state centralized in store modules and avoid state duplication.
- Add documentation in docs alongside feature-level architectural changes.
