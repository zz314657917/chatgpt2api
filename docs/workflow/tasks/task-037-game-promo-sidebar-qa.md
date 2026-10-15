---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-sidebar-qa
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo-sidebar.md
---

# 游戏推广侧栏浏览器验收

## Task ID
task-037-game-promo-sidebar-qa

## Role
Independent QA. Read the completed implementation, drive an isolated real Chromium browser and report evidence. No business-source edits.

## Goal
Verify the project's collapsible rail and responsive layout following the canvas interaction.

## Success Criteria
- Desktop collapsed width approximately 68px and expanded approximately 276px; explicit toggle, hover expansion/leave, persistence across reload, current highlight and correct project count.
- Hover expansion does not pin the rail. Keyboard focus cannot reach hidden project actions. New/select/rename/copy/delete with confirmation all work; working on a non-selected card must not accidentally switch project.
- Closing/selecting in mobile drawer works at 390px and 768px. At 1280px/1440px, collapsed and expanded states have no horizontal overflow or clipped controls. Rail is independently scrollable while workspace remains usable.
- Existing facts/references, copy/hero confirmations, complete nine-design/sixteen-slot preview and upload/crop/export controls remain accessible.
- Refresh preserves project data while retaining collapse preference, not generating additional tasks.
- Capture labelled desktop collapsed/expanded and mobile screenshots, browser errors, executed checks and limitations.

## Allowed Paths
- `docs/workflow/evidence/task-037-game-promo-sidebar/**`
- `docs/workflow/qa-reports/task-037-game-promo-sidebar-qa.md`
- Generated scratch files under `.codex-build/task-037-game-promo-sidebar-qa/**`.

## Denied Paths
- Business source, package manifests, backend, configuration, knowledge, memories, deployment and existing unrelated artifacts.
- Paid generation and user browser state/profile.

## Constraints
- Use user-approved `gpt-6.1-sol`; do not delegate further.
- Use installed Playwright and Chromium; no new dependencies or test framework.
- May reuse `docs/workflow/evidence/task-037-game-promo/browser-harness.cjs`, setting QA_SOURCE_ROOT to main worktree and own QA_OUT_DIR.
- Use a separate browser profile/context and task-owned Vite if needed. Stop only own QA processes, never the user's preview.
- Mock API is authorized for UI verification only. State explicitly that images/model calls are demo fixtures rather than live AI generation.
- Any failure: report exact reproduction and root cause to parent/developer; do not repair business source yourself.

## Acceptance Commands
- Run your focused real browser script and save results/screenshots.
- Review developer's current build/lint/pure-assert evidence; rerun only if new changes or unresolved issues justify it.

## Output
Report first line `### PASS: task-037-game-promo-sidebar-qa`, `### FAIL: ...` or `### BLOCKED: ...`. Include Findings, Executed Checks, screenshots/JSON paths, Unverified Risks and Recommendation.

## Stop Rules
No commits, deployments, live AI service, source edits or unrelated process termination. Never treat mock AI images as live acceptance.
