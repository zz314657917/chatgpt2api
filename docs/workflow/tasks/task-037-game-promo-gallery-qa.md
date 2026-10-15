---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-gallery-qa
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo-gallery.md
---

# Lower gallery browser verification

## Task ID
task-037-game-promo-gallery-qa

## Role
Independent QA. No delegation or source edits.

## Goal
Verify the lower masonry slot section against the approved layout contract.

## Success Criteria
- Measure that all sixteen slot cards are in a separate section below the input/copy/design grid, spanning available workspace width.
- Verify computed CSS columns, unbroken cards, natural preview ratios, completed/missing counts and missing-card aspect ratio.
- Check 390px, 768px, 1440px with expanded/collapsed desktop project rail. No horizontal document overflow; workspace scroll reaches gallery and document cannot scroll into blank space.
- Exercise crop drag, zoom, reset and actual-pixel preview; verify persistence after reload.
- Download PNG and JPEG single-slot files and complete ZIP, inspect real bytes, names and dimensions. Partial missing state retains all cards and exports only completed slots.
- Use isolated browser state and local source server; no live AI generation. Report fixture versus live limits plainly.

## Allowed Paths
- `docs/workflow/evidence/task-037-game-promo-gallery/*`
- `docs/workflow/qa-reports/task-037-game-promo-gallery-qa.md`

## Denied Paths
All source, configuration, dependencies, knowledge, memories and deployment.

## Constraints
Use existing Playwright/browser harness and dependencies. No installs, user-profile access, commits, push, deploy, or further delegation. Do not stop/restart the existing Vite 5173 or demo API 18737 processes. Task-owned isolated browser/server processes may be closed by exact owned handle.

## Acceptance Commands
Run the scoped Playwright script and inspect its JSON results and screenshots. Compare page source SHA-256 with worker report and protected baseline.

## Output
`docs/workflow/qa-reports/task-037-game-promo-gallery-qa.md`, first line `### PASS: task-037-game-promo-gallery-qa` or FAIL/BLOCKED. Include findings, commands, evidence and limits.

## Stop Rules
Report implementation failures without editing source. Never use real paid image generation.
