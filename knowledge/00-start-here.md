# ChatGPT2API Knowledge Entry

## Purpose

This directory stores project-local context that is useful across Codex sessions. It should stay short, factual, and actionable.

## Read Order

1. Read `AGENTS.md` for repository rules, architecture, commands, and safety constraints.
2. Read `knowledge/05-current-focus.md` for the current default product mental model and recent stable constraints.
3. Read `knowledge/03-build-and-verify.md` for build/test commands and image-workspace verification entry points.
4. Read `knowledge/tasks/current-task.md` when continuing an unfinished task.
5. Read `knowledge/tasks/timeline.md` when the user asks for recent history, phase summary, or recovery context.
6. Read domain notes only when they match the current task. For `/canvas`, Sub2API launch/redeem, or embedded-session issues, read `knowledge/06-canvas-and-embedded-session.md`. Existing ChatGPT web protocol research remains under `jshook/docs/`.

## Stable Project Facts

- The repository is a Go backend with a Vite/React admin UI.
- Backend packages live under `internal/`; frontend source lives under `web/src/`.
- ChatGPT web reverse-engineering notes and validation scripts belong under `jshook/`.
- Admin async creation-task routes use `/api/creation-tasks` with explicit child resources: `image-generations`, `image-edits`, and `chat-completions`.
- The project currently targets ChatGPT web account capabilities and OpenAI-compatible image/text endpoints.
- The current product-facing default is no longer a generic ChatGPT web wrapper only; it now includes a Sub2API-launched standalone image workspace and a white-label profile experience.

## Current Known Capability Notes

- A repository scan on 2026-05-16 found no `SuperGrok`, `Grok`, or `xAI` implementation or configuration entries.
- Current documented model options are focused on `gpt-5*`, `gpt-image-2`, `codex-gpt-image-2`, and `auto`.
- Adding Grok support would be a new integration decision, not a currently supported capability.
- Recent image-workspace changes added a stronger default policy surface: continued edit flow, drag-result-into-editor flow, draft preservation, per-user image retention cap, and image workspace policy hardening.
- Stable image behavior now needs to be understood together across backend routes, image task/service logic, config limits, and the React image workspace page, not only from git history.

## Knowledge Hygiene

- Do not store secrets, live tokens, cookies, private prompts, private URLs, account identifiers, or reusable CDN/download URLs here.
- Keep long protocol research in `jshook/docs/` and use this directory only as an index or high-signal project memory.
- Prefer updating `current-task.md` for the active handoff and `timeline.md` for phase history.

<!-- codex:pge-workflow:start -->
## Planner / Generator / Evaluator Workflow

- 本仓库的交付流程产物位于 `docs/workflow/`。
- 默认 Agent Matrix：`docs/workflow/agent-matrix.md`；命中 `P/G/E`、`Agent Matrix`、`worker` 或 `测试 worker` 时按矩阵分工执行。
- 当前阶段阅读顺序：`docs/workflow/status.md` -> `docs/workflow/agent-matrix.md` -> `docs/workflow/spec.md` -> 当前 Sprint 的 contract/review/qa/fix-log。
- 会话暂停、续做或换人接手时，仍优先更新 `knowledge/tasks/current-task.md` 作为事实源；阶段完成或需要保留最近重点时追加 `knowledge/tasks/timeline.md`。
- 小型一次性修改可显式绕过该流程；多 Sprint 或需要验收门禁的任务默认启用。
<!-- codex:pge-workflow:end -->
