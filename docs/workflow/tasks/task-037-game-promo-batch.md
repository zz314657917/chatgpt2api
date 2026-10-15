---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-batch
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

# Batch generation and complete regeneration

## Task ID
task-037-game-promo-batch

## Role
Generator in main worktree. No further delegation.

## Goal
Add two clear batch entry points with one shared correction field, durable progress and preserved histories, retaining explicit copy/hero confirmation.

## Success Criteria
- Replace the ambiguous eight-design button with a distinct batch panel: shared “整套修改要求”, “生成缺失设计”, “按新要求重生成整套”.
- Missing mode targets only designs without a successful selected image, skips active tasks and never overwrites completed designs. If hero is missing, generate it first; after explicit approval automatically continue the missing dependents. If an existing successful hero needs approval, wait for approval without replacing it.
- Regenerate mode targets all nine designs regardless of completed selections. Generate a new hero first, visibly wait for explicit approval of that exact batch hero, then automatically submit the other eight with the approved new hero reference. No extra per-design clicks.
- Require valid confirmed copy and an available reference-capable model before starting. All nine tasks use the captured shared correction and consistent captured project inputs/models/references/settings/draft. Changed inputs during a batch must stop future submissions visibly; never silently combine old and new content.
- Persist batch identity, mode, correction, target design list and task/version association in the account-scoped project before network requests. Show per-batch completed/total, running/awaiting hero/failed/stopped/completed states and meaningful errors.
- Resume already authorized batch scheduling/polling after refresh without duplicate POSTs. An uncertain submission remains associated with its pre-persisted version/task ID and is only queried. No automatic retry of failed or ambiguous submissions. A single failed dependent does not prevent other targets; show the failure for manual retry through existing card actions.
- Prevent double starts and overlapping batches/individual submissions for the same project. Batch orchestration guards must cover double click, refresh, unmount, scope change, project deletion and cross-tab storage mutations using atomic persisted association/claims.
- Stop action prevents future batch submissions; clarify any already submitted tasks continue and may be cancelled through their existing card action. Failed/cancelled hero stops dependent submissions. Approval is never automatic.
- Preserve every previous version and selected-version controls. Failed regeneration retains the old history; previous versions remain selectable. Copying a project must not inherit a running batch or auto-submit tasks.
- Keep sidebar, lower masonry gallery, crop/export mapping, routes and API resources unchanged. No backend or dependency change.
- Build/lint and focused assertions cover batch planning/lifecycle. Independent browser QA covers network counts, hero gating, correction propagation, refresh recovery, failures, stop and history.

## Allowed Paths
- `web/src/app/game-promo/page.tsx`
- `web/src/lib/game-promo/tasks.ts`
- `web/src/lib/game-promo/core.ts`
- `web/src/lib/game-promo/batch.ts` (optional focused helper)
- `web/src/lib/game-promo/batch.test.ts` (optional pure assertions)
- `web/src/store/game-promo-projects.ts`
- `docs/workflow/worker-results/task-037-game-promo-batch-result.md`

## Denied Paths
All other source, backend, API library, routes/sidebar/crop/export helpers, dependencies, configuration, knowledge, memory and deployment.

## Constraints
User explicitly approved both batch entry points. Model `gpt-6.1-sol` only. Preserve the dirty worktree and use the before snapshots in `.codex-build/task-037-game-promo-batch`. Do not control existing preview servers 5173/18737. No installs, commits, pushes, deploys or live paid generation. English code comments.

## Acceptance Commands
- `cd web; npm.cmd run build`
- `cd web; npm.cmd run lint`
- Execute focused meaningful batch assertions with existing TS/Vite/node facilities.
- Compare exact scope against before snapshots and verify protected hashes.

## Output
`docs/workflow/worker-results/task-037-game-promo-batch-result.md`, first line `### DONE: task-037-game-promo-batch` or BLOCKED/FAILED; include source manifest, commands, semantics, evidence, limits.

## Stop Rules
Stop if source outside the allowlist, a new dependency, backend change or paid generation is needed. Report scope questions to parent; no delegation or deployment.
