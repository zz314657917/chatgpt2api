---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-application-qa
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo-application.md
---

# Task ID
task-037-game-promo-application-qa

## Role
Independent QA. No business source edits or delegation.

## Goal
Verify the approved application-materials increment in the main worktree using an isolated browser and controlled transport. Keep mock evidence distinct from real upstream acceptance.

## Success Criteria
- Read implementation contract and inspect exact source changes before testing.
- Exercise original projects without application data, factual inputs, generated editable 3+1 outputs, per-field copy and actual TXT download.
- Capture complete prompts and verify grounding, explicitly missing facts, Chinese-only banner instructions and original reference bytes/source.
- Test malformed structured copy, late completion after user edit, confirmation gates, English title validation, history and selected-version restoration.
- Test independent banner generation, upload, crop, actual PNG/JPEG bytes at 1082x300, size guard and human confirmation bound to version/crop.
- Verify refresh does not resend, double submission/cross-tab claims, account/deletion/unmount pre-POST guards and clone authority cleanup.
- Verify original batch/application task concurrency, original 9/16 mapping and actual full ZIP16 remains unchanged.
- Capture 390px and 1440px layouts, no horizontal overflow or document blank scrolling.
- Run build/lint and focused assertions; report exact commands, source hashes, evidence and unverified real AI limitations.

## Allowed Paths
- `docs/workflow/evidence/task-037-game-promo-application/**`
- `docs/workflow/qa-reports/task-037-game-promo-application-qa.md`

## Denied Paths
All business source, dependencies, configs, knowledge/memory, deployment and unrelated evidence.

## Constraints
Use gpt-6.1-sol. Wait for root READY before executing final-source QA. Preserve existing 5173/18737 processes and user browser profiles. No paid/live generation, platform submission, installs, commits, pushes or deployment. Local mocked transport must be explicit.

## Acceptance Commands
- `cd web; npm.cmd run build`
- `cd web; npm.cmd run lint`
- Focused Node/Vite pure assertions and real Chromium interaction through Playwright.
- Source SHA256 manifest and actual downloaded byte inspection.

## Output
Report first line `### PASS: task-037-game-promo-application-qa`, FAIL or BLOCKED; include findings, executed checks, evidence, limits and source manifest.

## Stop Rules
Implementation defects return to root/developer. Fix test harness errors within allowed evidence only. Never substitute mock image appearance for real generated content review.
