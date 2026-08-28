# Task-035: Seedream Image Profiles

## Task ID
task-035-seedream-image-profiles

## Role
P/G/E Generator。仅按本 contract 为豆包 Seedream 4.0、4.5、5.0 Lite、5.0 Pro 补齐模型目录、参数 profile、后端 payload 和前端工作台传播，不修改 Sub2API。

## Goal
以 2026-08-27 APIMart 官方文档为准，在 chatgpt2api 内建立按模型区分的 Seedream 参数契约。4.x 继续使用现有 doubao-seedance-4-0/4-5 bridge ID，新增下游已支持的 seedream-5-0-lite 与 seedream-5-0-pro。

## Success Criteria
- 模型目录、图片页、Canvas、电商套图和 Image Arena 可识别四个 Seedream profile；旧 4.x bridge ID 不替换为下游尚未识别的官方 4.x ID。
- Seedream 4.0 接受 1K/2K/4K、n=1..15；Seedream 4.5 接受 2K/4K、n=1..15；4.x 输入图与输出图合计最多 15。
- Seedream 5.0 Lite 接受 2K/3K/4K、PNG/JPEG、组图字段和 n=1..15，输入图与输出图合计最多 15。
- Seedream 5.0 Pro 固定 n=1、最多 10 张参考图，接受 1K/1.5K/2K 或合法精确像素 size、PNG/JPEG；不暴露下游尚未转发的高级能力。
- Seedream payload 使用模型专属 size/resolution/image_urls/nsfw_check/output_format/watermark/已支持 sequential 字段，不误发通用质量、Gemini 搜索或 Grok 字段；非法值本地返回 400。
- 图片数量上限按模型 profile 生效，不能把所有图片模型全局放宽为 15；任务记录、输出状态和结算数量与 n 一致。
- 定向 Go、相关包、全量 Go、前端 lint/build、限定 diff 和隔离浏览器 mock 验收通过。

## Context
- Repo: F:/java/chatgpt2api
- Official sources verified on 2026-08-27:
  - https://docs.apimart.ai/cn/api-reference/images/seedream-4/generation
  - https://docs.apimart.ai/cn/api-reference/images/seedream-4.5/generation
  - https://docs.apimart.ai/cn/api-reference/images/seedream-5-lite/generation
  - https://docs.apimart.ai/cn/api-reference/images/seedream-5-0-pro/generation
- Downstream: Sub2API 已识别 seedream-5-0-lite/seedream-5-0-pro，4.x 仍只识别现有 doubao-seedance-4-0/4-5；本 task 不修改下游。

## Allowed Paths
- internal/util/json.go
- internal/util/image_models_test.go
- internal/httpapi/sub2api.go
- internal/httpapi/app.go
- internal/httpapi/app_test.go
- internal/httpapi/routes.go
- internal/httpapi/sub2api_test.go
- internal/httpapi/image_gateway_models_test.go
- internal/httpapi/canvas.go
- internal/httpapi/canvas_test.go
- internal/service/image_task.go
- internal/service/image_task_test.go
- web/src/lib/api.ts
- web/src/lib/api.assert.ts
- web/src/lib/image-parameters.ts
- web/src/lib/image-model-settings.ts
- web/src/lib/image-model-settings.assert.ts
- web/src/components/image-model-settings-button.tsx
- web/src/components/image-output-controls.tsx
- web/src/app/image/image-options.assert.ts
- web/src/app/image/components/image-composer.tsx
- web/src/app/image/components/image-arena-composer.tsx
- web/src/app/image/page.tsx
- web/src/app/canvas/canvas-node.tsx
- web/src/app/canvas/canvas-utils.ts
- web/src/app/canvas/canvas-utils.assert.ts
- web/src/app/canvas/use-smart-canvas-controller.ts
- web/src/app/ecommerce-suite/page.tsx
- web/src/lib/image-arena/image-arena-adapter.ts
- web/src/lib/image-arena/image-arena-agents.ts
- web/src/lib/image-arena/image-arena-agents.assert.ts
- web/src/lib/image-arena/image-arena.assert.ts
- web/src/lib/image-arena/image-arena-model-capabilities.ts
- web/src/store/image-conversations.ts
- web/src/store/ecommerce-suite-projects.ts
- docs/workflow/worker-results/task-035-seedream-image-profiles-result.md
- docs/workflow/qa-reports/task-035-seedream-image-profiles-qa.md

## Denied Paths
- F:/mcplugins/sub2api/**
- internal/storage/**
- internal/config/**
- deploy/**
- .env*
- C:/Users/Administrator/.codex/memories/**
- 数据库、鉴权、权限、计费公式、报价、Docker、部署和生产配置。

## Constraints
- 遵循 No compatibility layers；不添加旧官方 ID fallback，不把 4.x bridge ID 改成当前下游不能路由的别名。
- Seedream 专属请求不得经过会把比例转换为通用像素尺寸的共享路径。
- n 按模型 profile 计算；Pro 固定 1，4.x/Lite 才允许最高 15，并校验输入图 + 输出图上限。
- 参考图沿用现有上传和公共 URL 链路；不实现下游尚未转发的 Pro 图层拆分、透明编辑和完整 optimize 参数。
- 不部署、不更新 Docker、不使用真实 APIMart Token 或付费额度。
- 只做精确补丁，不回滚或覆盖工作区既有 Task-025..034、拼豆、Gemini 及其它用户改动。

## Acceptance Commands
go test ./internal/httpapi -run "Test.*(Seedream|CanvasImageModel)" -count=1
go test ./internal/service ./internal/util -run "Test.*(Seedream|ImageTaskCount|ImageGenerationModel)" -count=1
go test ./internal/httpapi ./internal/service ./internal/util -count=1
go test ./...
在 web/ 运行 npm.cmd run lint 与 npm.cmd run build。
对 Allowed Paths 运行 git diff --check -- exact paths。

## Browser Acceptance
- 图片页和 Canvas 能选择四个 profile；4.0/4.5/Lite 显示各自合法分辨率和数量，Pro 显示固定 1 张、最多 10 张参考图及 PNG/JPEG。
- 4.5 不显示 1K，Pro 不显示组图；Lite 的 sequential 参数只在其 profile 生效。
- mock 请求的模型、size/resolution、n、参考图、nsfw_check、格式和 watermark 与 UI 一致，且无 quality、Gemini 搜索或 Grok 字段。
- 非法旧保存状态提交前收敛；超出数量或输入图+输出图上限时本地拦截。

## Output
- docs/workflow/worker-results/task-035-seedream-image-profiles-result.md
- docs/workflow/qa-reports/task-035-seedream-image-profiles-qa.md

## Stop Rules
- 必须修改 Sub2API、计费、鉴权、数据库、部署或 Docker 时报告 BLOCKED。
- 15 张数量若无法在不改变其它模型全局限制的前提下进入任务服务，停止并回 Planner。
- 官方文档与下游可路由 ID 冲突时保留 bridge ID 并记录 deferred，不自行改下游。
- 不覆盖或回滚不属于本 task 的既有改动。

## Budget
- worker_mode: codex-direct
- qa_worker_mode: codex-direct
- worker_model: gpt-5.6-sol
- qa_worker_model: gpt-5.6-sol

## Amendment 1 (2026-08-28)
- 允许修改 `internal/httpapi/app.go` 与 `internal/httpapi/app_test.go`，用于 multipart 图片编辑请求读取并验证 Seedream 专属字段。
- 允许修改 `web/src/lib/image-arena/image-arena-model-capabilities.ts` 与 `web/src/lib/image-arena/image-arena-agents.assert.ts`，用于同步 Arena 的四个 Seedream profile 与模型断言。
- 允许修改 `web/src/components/image-output-controls.tsx` 与 `web/src/app/image/image-options.assert.ts`，用于按模型限制 Seedream 5.0 只显示 PNG/JPEG，并覆盖输出格式断言。
- 以上均为既有 Success Criteria 的实际所有者文件；Denied Paths、验收命令和其它边界不变。
