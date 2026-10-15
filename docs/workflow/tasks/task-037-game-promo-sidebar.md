---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-sidebar
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

# 游戏推广项目侧栏

## Task ID
task-037-game-promo-sidebar

## Role
Generator. Implement this scoped follow-up in the shared main worktree. Do not delegate further.

## Goal
Replace the game-promo project's dropdown/management block with a dedicated collapsible project rail matching the existing infinite-canvas project list.

## Success Criteria
- Reference `SmartCanvasLeftRail` in `web/src/app/canvas/canvas-node.tsx`: desktop collapsed narrow rail (~68px), expanded project list (~276px), hover expansion and explicit expand/collapse controls, current project highlight and project count.
- Expanded project cards show project title and a useful summary; new/select/copy/delete remain available. Support inline project rename using existing project persistence. Delete must still require confirmation.
- Remember explicit collapse preference across refresh using a dedicated non-sensitive UI preference key. Hover expansion does not change the saved preference. Hidden controls are not keyboard-focusable.
- Move only project management out of the existing input panel. Game facts, activities, model settings and references remain accessible inside the workspace regardless of rail state.
- Rail occupies the page's full available height and has independent scrolling. Workspace expands when the rail contracts. Avoid importing the canvas runtime or changing canvas code.
- At narrow widths use an accessible project drawer and trigger. Closing/selecting a project closes the drawer. No horizontal overflow at 390px or clipped workspace at 768px, 1280px and 1440px.
- Preserve project identity isolation, copy semantics, task recovery, history, all sixteen export slots and generation gates.
- Update the running local Vite preview through normal HMR; do not stop unrelated processes or call paid generation.

## Allowed Paths
- `web/src/app/game-promo/page.tsx`
- `web/src/app/game-promo/project-sidebar.tsx`
- `web/src/app/animated-routes.tsx` — only include `/game-promo` in the existing viewport workspace predicate.
- `docs/workflow/worker-results/task-037-game-promo-sidebar-result.md`

## Denied Paths
- All other source paths, `internal/**`, `deploy/**`, `.env*`, `knowledge/**`, global memories.
- Package manifests/lockfiles, backend APIs, auth semantics, deployment and production.
- Existing game-promo pure logic, task and export helpers, and project store.

## Constraints
- No dependencies, commits, pushes, deploys or live generation. Preserve all existing main-worktree changes.
- Use `gpt-6.1-sol` via Codex agent. Existing worker no longer owns these files; this contract authorizes the new narrow scope.
- Reuse UI primitives and current theme. English code comments. Use dedicated local component rather than coupling with canvas document types.
- Share the main worktree because the requested preview runs from it; edit only allowed paths. Parent captures the prior page in scratch for precise review.
- No new test framework. Independent browser verification is owned by QA/parent after implementation.

## Acceptance Commands
- `cd web; npm.cmd run build`
- `cd web; npm.cmd run lint`
- `node web/src/lib/game-promo/run-assertions.mjs`
- `git diff --check -- web/src/app/game-promo`

## Output
`docs/workflow/worker-results/task-037-game-promo-sidebar-result.md`; first line `### DONE: task-037-game-promo-sidebar` or `### BLOCKED/FAILED: task-037-game-promo-sidebar`. Include changed paths, commands run, UI behavior and unverified risks.

## Stop Rules
Stop if backend, identity/persistence schema, canvas source or dependencies must change. Do not replace the running preview or broaden scope.

## QA Fix Amendment (2026-10-15)
- Independent QA found that sixteen projects stretch both the rail and workspace to 4906px: `AnimatedRoutes` omits `/game-promo` from its viewport workspace predicate, so the route wrapper has no bounded flex height.
- Evaluator approves the single route-predicate addition above because it is necessary for the user-requested full-height collapsible rail and independent scroll.
- Rerun build/lint and scoped assertions after the fix; QA must retest independent rail scrolling, normal workspace wheel scrolling to bottom, and responsive geometry.
- Parent subsequently traced document overflow to `sr-only` absolute file inputs whose `offsetParent` was BODY. In an isolated Chromium context, setting the game-promo root MAIN to `position:relative` reduced document height from 2496px to the 1000px viewport. Approved fix is only adding `relative` to that existing root class; QA must verify additional bottom wheel events keep document `scrollY=0`.
