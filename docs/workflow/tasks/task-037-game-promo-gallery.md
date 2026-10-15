---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-gallery
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

# 下方投放视觉区

## Task ID
task-037-game-promo-gallery

## Role
Generator. Scoped layout follow-up in main worktree. No further delegation.

## Goal
Move all sixteen export slots below the inputs/copy/design workspace into a dedicated full-width masonry visual section.

## Success Criteria
- The input/design area has no right-hand slot column. After the top editor grid, a visually distinct full-width section displays all sixteen slots with a heading, completed count and missing status.
- True masonry presentation using responsive CSS columns and unsplit cards, with natural card heights from the actual ratios. One column on small phones, more columns as the actual workspace width increases. No new dependency.
- Each card retains name, exact width×height, existing CropPreview with drag/zoom/actual pixels/reset, and single-slot download. Existing PNG/JPEG and ZIP behavior remains untouched.
- Missing cards remain visible in their prescribed ratio with their missing design name; no hidden or omitted slots.
- Preserve sidebar expansion, root relative positioning, bounded scroll, upload/ref/model/copy/history/confirmation/task behavior and account persistence.
- At 390px, 768px and 1440px (both rail states), no horizontal page overflow or split cards. The gallery starts below the top editor grid and uses the workspace's full available width.
- Build/lint pass. Browser verification owns actual DOM geometry, crop interaction, full/partial exports and overflow. No real paid AI generation.

## Allowed Paths
- `web/src/app/game-promo/page.tsx`
- `docs/workflow/worker-results/task-037-game-promo-gallery-result.md`

## Denied Paths
- All other source, backend, route, sidebar, store/core/task/export helpers, configuration, dependencies, knowledge, memories and deployment.

## Constraints
- User-approved `gpt-6.1-sol`, preserve existing dirty worktree, no commits/pushes/deploys.
- One-file layout change; no framework, new persisted preferences or backend.
- Vite preview is already running on 5173 with demo API 18737; do not restart or stop it, HMR is sufficient.
- Use container queries if needed so rail expansion changes gallery columns correctly. Existing root relative/overflow structure must remain.
- Browser tests are scoped to this layout; do not repeat unrelated project CRUD/generation acceptance.

## Acceptance Commands
- `cd web; npm.cmd run build`
- `cd web; npm.cmd run lint`
- Diff/whitespace comparison against parent scratch before file.

## Output
`docs/workflow/worker-results/task-037-game-promo-gallery-result.md`, first line `### DONE: task-037-game-promo-gallery` or BLOCKED/FAILED, changed files, commands, layout and limitations.

## Stop Rules
Stop if any denied source or dependency must change. No live generation or process control.
