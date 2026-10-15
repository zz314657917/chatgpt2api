---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-split-qa
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo-split.md
---

## Role
Independent browser QA, no business-source edits or delegation.

## Goal
Verify ecommerce-style editor-left and preview-right layout, responsiveness and preserved workflows.

## Success Criteria
- 1440/1920 desktop editor and preview have expected two-pane bounds, independent vertical scrolling and usable width with project rail collapsed and expanded.
- All inputs and generation controls stay in editor; all nine design cards, application banner preview/crop/export, and sixteen-slot masonry stay in preview.
- No duplicate application controls/task lifecycle/network submit after splitting UI.
- 768/390px stack editor above previews with a single bounded scroll and no horizontal overflow or blank document scrolling.
- Existing mocked project fixture verifies original 9/16 export and application 1082x300 export remain functional with actual bytes.
- Capture screenshots, DOM geometry/scroll evidence, API request counts, file bytes, console errors and final source SHA manifest.

## Allowed Paths
- `docs/workflow/evidence/task-037-game-promo-split/**`
- `docs/workflow/qa-reports/task-037-game-promo-split-qa.md`

## Denied Paths
All business source, dependencies, config, knowledge/memory, deployment and unrelated evidence.

## Constraints
Use gpt-6.1-sol. Wait for final root READY before browser execution. Use isolated Playwright profile and local mock transport, no live/paid generation. Preserve 5173/18737 and user profiles; no installs/commits/push/deployment.

## Acceptance Commands
- Playwright-based Chromium against source on isolated random port.
- `cd web; npm.cmd run build`
- `cd web; npm.cmd run lint`
- Focused assertions and before/after source SHA256.

## Output
First line `### PASS: task-037-game-promo-split-qa`, FAIL or BLOCKED; include actual evidence and mock/live limits.

## Stop Rules
Return UI defects to root/developer. QA can adjust scripts only in allowed evidence; never edit implementation.
