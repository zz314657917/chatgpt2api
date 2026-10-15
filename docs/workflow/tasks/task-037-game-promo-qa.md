---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-qa
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

## Task ID
task-037-game-promo-qa

## Role
Independent QA Worker. Read-only application review and browser verification of the approved game promotion suite. Do not implement production fixes, delegate, commit or deploy.

## Goal
Verify the user-approved contract and report actual checks separately from upstream paid generation acceptance.

## Success Criteria
- Validate sixteen exported filenames and exact image dimensions, nine designs and seven sizes, both PNG and JPEG. Inspect ZIP payload rather than merely checking a download happened.
- Exercise reference upload, library-original selection, purpose editing, copy draft/edit/confirmation, hero approval, eight remaining designs and task statuses, replacement/version selection, actual-size previews and drag/zoom crop.
- Check project copy, refresh resume without duplicate submit, late completion after project switch, per-user isolation, failed/text-only task, invalid draft, missing-slot download and double clicks.
- Check /image permission inheritance, desktop and mobile navigation, no console errors and layout at desktop/tablet/mobile widths. Capture source-based UI screenshots.
- Build/lint and new pure assertions are real command checks. Browser fixtures test interaction/export only, not paid AI quality.
- Report BLOCKED for real generation unless an existing authenticated test service with usable models is available. Do not access live user browser profiles or dump secrets. Do not spend image credits or create production accounts without parent direction.

## Allowed Paths
- `docs/workflow/qa-reports/task-037-game-promo-qa.md`
- `docs/workflow/evidence/task-037-game-promo/**`
- Outside Git: task-owned `.codex-build/task-037-game-promo-qa/**` or `E:/codex-runtime/pge/chatgpt2api/task-037-game-promo-qa/**` scratch scripts/logs/screenshots.

## Denied Paths
- All production application source files, .env, credentials, deploy, database, global memory and unrelated work.

## Constraints
- Model gpt-6.1-sol, approved directly by user on 2026-10-14. Use Codex agent tools, not old Claude runner.
- Review Developer source in E:/codex-worktrees/chatgpt2api/task-037-game-promo; parent will explicitly notify when ready.
- Existing browser harness examples in main repo docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs.
- Reuse installed Playwright runtime/browser; no new dependencies. Isolated browser context only.
- No process-wide cleanup; close only task-owned processes/contexts. Vite defaults use API port 8000; there is no currently confirmed live test service there.

## Acceptance Commands
- npm.cmd run build and npm.cmd run lint in developer web worktree, once parent says ready.
- Execute pure assertions supplied by developer.
- Execute a task-specific Playwright browser script against source Vite with recorded fixtures if live API is unavailable, label all evidence accurately.
- git diff --check against task changes.

## Output
- docs/workflow/qa-reports/task-037-game-promo-qa.md. First line ### PASS / FAIL / BLOCKED: task-037-game-promo-qa; include findings, executed checks, artifacts, outstanding real generation evidence.
- Send concrete failing case/path/line to parent and developer. Never mark all acceptance complete from fixtures alone.

## Stop Rules
- Do not modify production source. Missing tools/auth/live upstream are evidence limitations, not grounds to silently substitute simulated results.
- Scope/permission changes or paid generation require parent direction.
