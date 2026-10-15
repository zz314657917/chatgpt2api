---
type: task-contract
status: approved
review_verdict: PASS
task_id: task-037-game-promo
worker_model: gpt-6.1-sol
base_commit: fe4953f86fbf9f4746dbfacbc422aed2131a9f93
spec_ref: docs/workflow/tasks/task-037-game-promo.md
---

# 游戏推广套图

## Task ID
task-037-game-promo

## Role
Generator. Implement the user-approved game promotion suite in the existing React application. Do not delegate further or commit.

## Goal
Add /game-promo: reference uploads/library, AI copy draft and confirmation, hero approval, nine complete AI posters, sixteen exact-size exports, local per-user projects and history.

## Success Criteria
- Exact slot mapping: 好友动态 160x90 hero; 通用界面 160x90 hero; 首页-轮播图 1082x300 banner; 首页-排行榜 96x54 hero; 首页-好友动态 140x160 portrait-short; 首页-近期推荐 140x160 portrait-short; 新品推荐 140x180 portrait-long; 游戏列表 140x160 portrait-short; 详情页-轮播图 400x225 hero; 详情页-同类游戏 140x180 portrait-long; 咨询首页-推荐游戏 240x135 hero; 轮播图1..5 400x225 carousel-1..5. Nine designs, sixteen files, seven sizes.
- Three-column responsive workspace: inputs/projects/references; nine design cards; sixteen previews. Chinese UX and existing theme/primitives.
- Create/copy/delete local projects using localforage, explicit account scope captured at load/write time; preserve completed versions, crop, copy, task IDs, references; copied projects clear active task IDs. Handle storage errors visibly.
- Multi-image upload and existing managed-image library selection using ORIGINAL images. Per-reference purpose text (scene/style/layout/logo) and per-project facts/activity. Enforce model reference limit, reserve one reference for approved hero for subsequent designs; never silently discard references.
- AI copy draft uses createChatCompletionTask, trusted facts only, editable structured title/short selling point and five carousel themes/copy. Validate malformed/text-only responses visibly. Explicit copy confirmation required before hero; changing input/copy invalidates confirmation, changing hero invalidates hero approval.
- Hero generation first, explicit hero approval then generate only missing eight designs; n=1 per task. Per-card regeneration with correction prompt and uploaded replacement, history/version choice. New image versions must not erase old versions or appear approved automatically.
- Reuse current model catalog/settings and /api/creation-tasks APIs. Only advertise models with reference support and use existing capability/parameter helpers; legal model sizes with safety area for eventual crop, no external undocumented protocol changes. The 1082x300 output is not blindly submitted as a model size. Text is rendered by AI, not a new text-layer editor.
- Persist task identity before network submit; prevent double clicks and duplicate requests. Resume polling on refresh and project switch without resubmission; handle failure/cancel/text-only success; each async completion updates the originating project/version only. No overlapping poll loops or leaked intervals.
- Exact browser Canvas exports PNG default/JPEG optional, authenticated original blob retrieval, no stretch; per-slot drag crop position and zoom with real-pixel vs fitted preview. Canvas crop geometry shared by preview and export. ZIP includes one uniquely named file per completed slot; missing slots named visibly; full set exactly sixteen. Reuse/extract existing ecommerce ZIP helper without unrelated refactor, release object URLs.
- /game-promo route and desktop/mobile navigation inherit /image permission. Do not change backend auth/permission catalog; confirm all frontend route/layout recognition needed. Existing image/ecommerce routes unchanged.
- Add meaningful pure assertions for mapping, crop geometry, draft parsing and lifecycle state helpers. Build/lint and scoped assertions pass. Browser real generation validation is owned by parent and cannot be substituted with mocks.

## Allowed Paths
- `web/src/app/game-promo/**`
- `web/src/store/game-promo-projects.ts`
- `web/src/lib/game-promo/**`
- `web/src/lib/zip.ts`
- `web/src/app/route-config.tsx`
- `web/src/app/app-shell.tsx`
- `web/src/components/top-nav.tsx`
- `web/src/components/mobile-nav-provider.tsx`
- `web/src/app/ecommerce-suite/page.tsx`
- `docs/workflow/worker-results/task-037-game-promo-result.md`

## Denied Paths
- `internal/**`
- `deploy/**`
- `.env*`
- `knowledge/**`
- `web/package.json`
- `web/package-lock.json`
- `docs/workflow/status.md`
- Database, auth semantics, backend, deployment, production processes and global memories.

## Constraints
- No new dependencies. Do not change existing behavior. English code comments. Use apply patches when possible.
- Existing examples: web/src/app/ecommerce-suite/page.tsx, store/ecommerce-suite-projects.ts, lib/api.ts, lib/image-task-request.ts, lib/image-model-settings.ts, lib/authenticated-image.ts, app/beads/bead-asset-picker.tsx.
- Main user's dirty knowledge files/logs are unrelated. Work inside your assigned worktree only.
- Use user-approved gpt-6.1-sol through Codex agent tools, not the old Claude runner. Do not change model.
- Do not call live paid generation during development; parent owns actual browser acceptance. Never expose secrets in outputs.
- If node_modules absent, reuse F:/java/chatgpt2api/web/node_modules with a directory junction for isolated builds; do not install dependencies or run npm ci.

## Acceptance Commands
- From worktree web directory: npm.cmd run build
- From worktree web directory: npm.cmd run lint
- Execute your new pure assertions using existing node/TypeScript facilities; report exact command.
- git diff --check

## Output
- docs/workflow/worker-results/task-037-game-promo-result.md, first line ### DONE: task-037-game-promo or BLOCKED/FAILED; include Task ID, Changed Files, Commands Run, Risks, Contract Compliance, summary of actual verification and unverified live generation.

## Stop Rules
- No commits/push/deploy. No broad cleanup. Stop if backend, auth boundary, new dependency or secret changes required.
- Report blocked model or missing tools; do not substitute models.
