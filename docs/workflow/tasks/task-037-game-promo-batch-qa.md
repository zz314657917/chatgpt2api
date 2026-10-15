---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-batch-qa
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo-batch.md
---

# Batch browser verification

## Task ID
task-037-game-promo-batch-qa

## Role
Independent QA. No source changes or delegation.

## Goal
Verify missing-only and all-nine regeneration with real browser interactions and mocked creation-task transport, inspect durable state and request counts.

## Success Criteria
- Missing with approved hero submits only missing nonactive designs; all-complete performs no POST. Missing hero submits one hero first and waits for explicit approval before dependent requests.
- Whole-suite regeneration appends a fresh hero despite an existing approved image, waits for that exact new hero approval, then submits eight additional designs. All nine receive captured shared correction; dependent requests attach the new approved hero reference.
- Histories remain intact, selectable old versions still render, copying does not inherit/resume a batch.
- Repeat/double clicks, two tabs in same account/project and refresh during uncertain/held POST never duplicate versions or POSTs; already submitted task IDs resume by query.
- Changing draft/facts/activity/model/reference settings, account switch, deletion or stop prevents future scheduling for the original batch. Do not mutate real user browser state. Old tasks never update a new account/project.
- Failed/cancelled hero blocks dependents. One failed dependent does not prevent other targets. Ambiguous transport failures query persisted task identity; no automatic retry.
- Batch counters and waiting/failed/stopped/completed status match stored versions and network results.
- 390px/1440px UI has both batch controls and shared requirement without overflow. Existing lower gallery remains sixteen cards; complete fixture ZIP still includes sixteen exact files.
- No live image/chat generation; no frontend console exceptions attributable to this increment.

## Allowed Paths
- `docs/workflow/evidence/task-037-game-promo-batch/*`
- `docs/workflow/qa-reports/task-037-game-promo-batch-qa.md`

## Denied Paths
All source, backend, dependencies, configuration, knowledge, memory and deployment.

## Constraints
Use existing Playwright and test harness with isolated browser context and task-owned random-port Vite. Preserve user preview 5173/18737 and profiles. No installs, commits/push/deploy, real paid calls, or further agents. Read implementation first to align selectors, persist source manifest and retained failure evidence. Diagnose test errors separately from implementation defects.

## Acceptance Commands
Run scoped Playwright script and focused existing pure assertions where relevant. Parse real downloaded ZIP bytes. Report exact command and exit code.

## Output
`docs/workflow/qa-reports/task-037-game-promo-batch-qa.md`, first line `### PASS: task-037-game-promo-batch-qa` or FAIL/BLOCKED; findings, checks, evidence, source SHA and unverified limits.

## Stop Rules
Do not fix production source. Report source failure to parent and retest after assigned fix. Never use real paid image generation.
