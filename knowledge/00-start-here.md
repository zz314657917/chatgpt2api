# ChatGPT2API Knowledge Entry

## Purpose

This directory stores project-local context that is useful across Codex sessions. It should stay short, factual, and actionable.

## Read Order

1. Read `AGENTS.md` for repository rules, architecture, commands, and safety constraints.
2. Read `knowledge/tasks/current-task.md` when continuing an unfinished task.
3. Read `knowledge/tasks/timeline.md` when the user asks for recent history, phase summary, or recovery context.
4. Read domain notes only when they match the current task. Existing ChatGPT web protocol research remains under `jshook/docs/`.

## Stable Project Facts

- The repository is a Go backend with a Vite/React admin UI.
- Backend packages live under `internal/`; frontend source lives under `web/src/`.
- ChatGPT web reverse-engineering notes and validation scripts belong under `jshook/`.
- Admin async creation-task routes use `/api/creation-tasks` with explicit child resources: `image-generations`, `image-edits`, and `chat-completions`.
- The project currently targets ChatGPT web account capabilities and OpenAI-compatible image/text endpoints.

## Current Known Capability Notes

- A repository scan on 2026-05-16 found no `SuperGrok`, `Grok`, or `xAI` implementation or configuration entries.
- Current documented model options are focused on `gpt-5*`, `gpt-image-2`, `codex-gpt-image-2`, and `auto`.
- Adding Grok support would be a new integration decision, not a currently supported capability.

## Knowledge Hygiene

- Do not store secrets, live tokens, cookies, private prompts, private URLs, account identifiers, or reusable CDN/download URLs here.
- Keep long protocol research in `jshook/docs/` and use this directory only as an index or high-signal project memory.
- Prefer updating `current-task.md` for the active handoff and `timeline.md` for phase history.
