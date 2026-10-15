---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-split
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

## Task ID
task-037-game-promo-split

## Role
Generator in main workspace, no further delegation.

## Goal
Change game-promo into left editing and right preview panes, following existing ecommerce-suite page layout.

## Success Criteria
- Existing collapsible project rail remains.
- Header stays above both panes. Desktop uses about 44:56 editor/preview widths with independent bounded vertical scrolling.
- Left holds facts, models/references, original copy, batch controls and application copy/banner generation inputs.
- Right holds nine design cards, dedicated application image preview/crop/export, and original sixteen-slot masonry previews.
- Every existing operation remains accessible: generation/confirmation, histories/retry/upload, copy/downloads, crop, batch, project actions.
- Avoid duplicate component/task lifecycles or duplicate file inputs. Application panel may expose its preview via a small shared rendering boundary; keep one application owner/state/lifecycle.
- At viewport below 1280px use stacked editor then preview with a single bounded workspace scroll. Avoid document/body blank scrolling, overflow, clipped forms or too narrow fields.
- Preserve data/store/tasks/export/mapping and actual image pixels; no behavior redesign.
- Build/lint plus real isolated browser screenshots at 1440, 1920, 768 and 390; desktop independently scrolling panes, rail expanded/collapsed and original ZIP16/application export regressions.

## Allowed Paths
- `web/src/app/game-promo/page.tsx`
- `web/src/app/game-promo/application-panel.tsx`
- `web/src/app/game-promo/application-preview.tsx` only if needed as a presentational component without duplicate state/task lifecycle.
- `docs/workflow/worker-results/task-037-game-promo-split-result.md`

## Denied Paths
All other source, dependencies, config, knowledge/memory, backend and deployment.

## Constraints
Use gpt-6.1-sol. Main dirty worktree preserved. Root has only started layout wrapper changes in page.tsx; finish them (JSX currently temporarily unbalanced). Before snapshot for page is application's final frozen version; application-panel before snapshot is captured separately. Keep exactly one application panel state/task lifecycle owner; split presentational subcomponents via explicit props if needed. Do not touch services 5173/18737, user profiles, installs, paid calls, commits/pushes/deployment. English code comments.

## Acceptance Commands
`cd web; npm.cmd run build`
`cd web; npm.cmd run lint`
Focused original assertions and exact diff/protected hash checks.

## Output
Report starts `### DONE: task-037-game-promo-split` or BLOCKED/FAILED; list exact paths, commands, limitations and final SHA256.

## Stop Rules
If business behavior change/denied path needed, report to root. No delegation.
