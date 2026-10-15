---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo-application
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

# Promotion application materials

## Task ID
task-037-game-promo-application

## Role
Generator in main worktree. No delegation.

## Goal
Add an independent application-materials section to /game-promo, generating application copy and a Chinese-only 1082×300 carousel, based on the supplied screenshots and user facts.

## Success Criteria
- Dedicated full-width section visually separate from original nine-design/sixteen-slot flow. Do not change DESIGNS/SLOTS or original ZIP16.
- Screenshot fields: “展示周内外联动或活动情况”, “模组/网络游戏特色情况”, “展示周更新内容”, optional “其他申请情况说明”. Provide corresponding factual input areas, AI copy generation, editable generated fields, per-field copying and combined TXT download.
- Reuse existing game title/facts/activity and model/reference selection. Require user-provided specific weekly activity/update facts for corresponding descriptions; absent inputs remain explicitly unprovided, never invent features/events/rewards/dates/metrics or claim eligibility/approval. Screenshot text is a reference for UI, not authority to submit to any platform. Do not browse/open its platform URL or auto-submit.
- Separate copy-task identity/history, prompt snapshot and result fingerprint. Parse structured JSON; preserve raw malformed responses visibly. Late completion after editing inputs/draft must not overwrite user's changes. Explicit application-copy confirmation gates banner generation.
- Separate application-banner versions/history/selection, correction, upload replacement and crop, independent of original banner. Output exact 1082×300 PNG or JPEG, measure actual blob bytes and block above 10,000,000 bytes with visible size/error. Accept PNG/JPG/JPEG uploads; original image source and shared CropPreview geometry, no stretching.
- Banner prompt requires simplified Chinese only, no English letters/words/English logos/watermarks. Account for English game names/logos/reference images with explicit instruction to omit/replace English, never promise automatic OCR. Show mandatory human “已检查图片无英文，主体和文字完整” check bound to selected image/version+crop; export requires it, changing selection/crop invalidates it. Explicitly state AI can err, this is visual confirmation.
- Provide a short editable Chinese banner headline/subtitle derived from the confirmed copy or manual input; reject English letters in these submitted text fields rather than passing contradictory text. Retain model safety-area instructions for exact final crop using existing legal model-size helpers.
- Reuse /api/creation-tasks chat/image children, existing original references/authenticated image reads, model settings and capability validation. Persist version/task ID before POST, atomic cross-tab claim, no duplicate POST after refresh, uncertain request queried only. Poll application tasks through current scoped lifecycle; no leaked loops.
- Account switch, deletion, unmount and changed inputs stop pending pre-POST work; late results update originating project/history only. Application tasks and original batch must not accidentally overlap contrary to original project task guards. Copying project clears application active task IDs and active authority, keeps editable completed content/history.
- Save section data in existing per-user browser project. Old projects without section data load normally. All existing sidebar, masonry, batch, original histories/crop/export behavior remains.
- Build/lint and focused pure assertions; independent browser QA covers prompt content, malformed/late responses, image refs, crop/size/download/confirmation/history, refresh/double-click/account isolation, original ZIP16.

## Allowed Paths
- `web/src/app/game-promo/page.tsx`
- `web/src/app/game-promo/application-panel.tsx`
- `web/src/lib/game-promo/application.ts`
- `web/src/lib/game-promo/application.test.ts`
- `web/src/lib/game-promo/tasks.ts`
- `web/src/lib/game-promo/batch.ts`
- `web/src/lib/game-promo/core.ts` (clone cleanup only)
- `web/src/store/game-promo-projects.ts`
- `docs/workflow/worker-results/task-037-game-promo-application-result.md`

## Denied Paths
All other source, backend/API library/routes/sidebar/crop/export/model helpers, dependencies, config, knowledge/memory and deployment.

## Constraints
User-approved gpt-6.1-sol. Preserve main dirty worktree and original preview servers 5173/18737. No installs, live paid calls, commits, pushes, deploys or platform submission. English code comments. Avoid needless abstractions; reuse current helpers and scoped store locks.

## Acceptance Commands
- `cd web; npm.cmd run build`
- `cd web; npm.cmd run lint`
- Run focused pure assertions with existing Node/Vite facilities.
- Exact diff/scope/hash review against `.codex-build/task-037-game-promo-application`.

## Output
`docs/workflow/worker-results/task-037-game-promo-application-result.md`, first line `### DONE: task-037-game-promo-application` or BLOCKED/FAILED, source manifest, executed commands, behavioral limits.

## Stop Rules
Report if denied source/backend/dependency changes are required. No further delegation or paid image generation.
