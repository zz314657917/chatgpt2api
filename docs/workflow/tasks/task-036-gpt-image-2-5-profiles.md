---
type: task-contract
scope: repository
status: approved
review_verdict: PASS
task_id: task-036-gpt-image-2-5-profiles
worker_model: codex-direct
base_commit: f04f91436d2078a4b34b98d8711ef7abaa4080bf
spec_ref: docs/workflow/spec.md#task-036-gpt-image-25-参数-profile
openspec_change: none
last_verified: 2026-09-09
---

# Task-036: GPT Image 2.5 Profiles

## Task ID
task-036-gpt-image-2-5-profiles

## Role
P/G/E Generator。只按本 contract 新增 GPT Image 2.5 Flare/Sunburst 模型及其网站设置、网关 payload 和校验，不替换现有 GPT Image 2/official。

## Goal
以 2026-09-09 实时读取的 APIMart GPT-Image-2.5 图像生成文档为准，为 `gpt-image-2.5-flare` 与 `gpt-image-2.5-sunburst` 建立共享但独立于旧模型的参数 profile，并贯通图片页、Canvas、电商套图和 Image Arena。

## Success Criteria
- 两个模型进入后端模型目录和四个前端图片工作台，显示清晰的 Flare/Sunburst 定位说明。
- 只允许 `auto`、15 种文档比例或满足规则的精确像素尺寸；分辨率只允许 `1k/2k/4k`。
- 质量只允许 `auto/low/medium/high/xhigh/max`，且 `xhigh/max` 不泄漏给旧 GPT Image 2。
- `n` 严格为 `1..4`，参考图最多 16 张；文生图与编辑统一提交 `images/generations` JSON payload。
- 输出格式支持 PNG/JPEG/WebP，压缩率只随 JPEG/WebP 发送；透明背景与 JPEG 组合在本地返回 400。
- 两个模型的请求只发送文档字段，不误发 official mask、Grok、Gemini、Seedream 或 partial image 字段。
- 定向/全量 Go、前端断言、lint/build、限定 diff 与浏览器 mock 验收通过。

## Context
- Repo: `F:/java/chatgpt2api`
- Source verified: `https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.5/generation.md`
- Verified at: 2026-09-09
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`

## Allowed Paths
- internal/util/json.go
- internal/util/image_models_test.go
- internal/httpapi/app.go
- internal/httpapi/app_test.go
- internal/httpapi/canvas.go
- internal/httpapi/canvas_test.go
- internal/httpapi/routes.go
- internal/httpapi/sub2api.go
- internal/httpapi/sub2api_test.go
- internal/httpapi/image_gateway_models_test.go
- internal/service/image_task.go
- internal/service/image_task_test.go
- web/src/lib/api.ts
- web/src/lib/api.assert.ts
- web/src/lib/image-task-request.ts
- web/src/lib/image-task-request.assert.ts
- web/src/lib/image-parameters.ts
- web/src/lib/image-model-settings.ts
- web/src/lib/image-model-settings.assert.ts
- web/src/components/image-model-settings-button.tsx
- web/src/components/image-output-controls.tsx
- web/src/app/image/page.tsx
- web/src/app/image/image-options.assert.ts
- web/src/app/image/components/image-composer.tsx
- web/src/app/image/components/image-arena-composer.tsx
- web/src/app/canvas/canvas-node.tsx
- web/src/app/canvas/canvas-utils.ts
- web/src/app/canvas/canvas-utils.assert.ts
- web/src/app/canvas/use-smart-canvas-controller.ts
- web/src/app/ecommerce-suite/page.tsx
- web/src/lib/image-arena/image-arena-adapter.ts
- web/src/lib/image-arena/image-arena-agents.ts
- web/src/lib/image-arena/image-arena-agents.assert.ts
- web/src/lib/image-arena/image-arena-model-capabilities.ts
- web/src/lib/image-arena/image-arena.assert.ts
- web/src/store/image-conversations.ts
- web/src/store/ecommerce-suite-projects.ts
- docs/workflow/spec.md
- docs/workflow/status.md
- docs/workflow/main-log.md
- docs/workflow/contract-reviews/task-036-gpt-image-2-5-profiles-review.md
- docs/workflow/worker-results/task-036-gpt-image-2-5-profiles-result.md
- docs/workflow/qa-reports/task-036-gpt-image-2-5-profiles-qa.md
- knowledge/tasks/current-task.md

## Denied Paths
- F:/mcplugins/sub2api/**
- internal/storage/**
- internal/config/**
- deploy/**
- .env*
- C:/Users/Administrator/.codex/memories/**
- 计费公式、报价、鉴权、权限、数据库、Docker、部署和生产配置。

## Constraints
- 遵循 No compatibility layers；不添加旧 ID alias 或 fallback，不改写现有 GPT Image 2/official 的参数语义。
- 2.5 比例与精确像素 size 必须保持原始语义，不经通用像素换算破坏 `size + resolution` 组合。
- 精确像素需满足：宽高均为 16 倍数、单边不超过 3840、比例不超过 3:1、总像素在 655360..8294400。
- 参考图复用现有临时引用/对象存储公共 URL 链路，不新增上传协议。
- 不使用真实 APIMart Token 或付费额度，不部署、不更新 Docker。
- 保留本地未推送提交 `f04f914` 与临时未跟踪文件，不回滚、不重写历史。

## Acceptance Commands
```powershell
go test ./internal/httpapi -run "Test.*(GPTImage25|CanvasImageModel)" -count=1
go test ./internal/service ./internal/util -run "Test.*(GPTImage25|ImageTaskCount|ImageGenerationModel)" -count=1
go test ./internal/httpapi ./internal/service ./internal/util -count=1
go test ./...
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
```
- 对 Allowed Paths 执行 `git diff --check -- <exact paths>`。

## Browser Acceptance
- 图片页和 Canvas 可选择 Flare/Sunburst，均展示 15 种比例、1K/2K/4K、六档质量、三种格式、背景与审核设置。
- 自定义像素入口可见且不被折叠成 Auto；JPEG 时透明背景不能形成非法提交。
- mock 文生图和参考图请求使用 `images/generations`，参考图请求发送 `image_urls`，无 `response_format`、mask、Grok/Gemini/Seedream 专属字段。
- 电商套图和 Image Arena 选择、保存恢复及请求参数与图片页一致。

## Output
- `docs/workflow/worker-results/task-036-gpt-image-2-5-profiles-result.md`
- `docs/workflow/qa-reports/task-036-gpt-image-2-5-profiles-qa.md`

## Stop Rules
- 必须修改 Sub2API、计费、鉴权、数据库、部署或 Docker 时报告 BLOCKED。
- 下游实际模型 ID 或 endpoint 与文档冲突时停止，不自行加 alias/fallback。
- 无法在不改变旧 GPT Image 模型语义的情况下隔离 `xhigh/max` 或尺寸校验时回 Planner。
- 不覆盖或回滚既有提交与用户临时文件。

## Budget
- worker_mode: codex-direct
- qa_worker_mode: codex-direct
- worker_model: codex-direct
- qa_worker_model: codex-direct
