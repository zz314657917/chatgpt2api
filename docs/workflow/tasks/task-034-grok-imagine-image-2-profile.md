# Task 034: Grok Imagine Image 2.0 Profile

## Task ID
task-034-grok-imagine-image-2-profile

## Role
你是 P/G/E 流程中的 Generator worker。仅按本 contract 将现有 Grok Imagine 1.5 图片通道替换为 APIMart `grok-imagine-image-2.0` 当前契约，不保留旧模型别名或生成/编辑双路径。

## Goal
把 Grok 图片模型、后端 payload 和前端参数控件统一升级到 APIMart Grok Imagine Image 2.0：文生图和最多 3 张参考图都提交到 `images/generations`，使用 `aspect_ratio`、`resolution`、条件性的 `quality`、`image_urls` 与 `nsfw_check`。

## Success Criteria
- 公共模型和上游模型均为 `grok-imagine-image-2.0`，仓库运行时代码不再包含 1.5 APIMart 生成/编辑别名。
- Grok 文生图和参考图请求统一使用 `images/generations`；不再为 Grok 调用 `images/edits`。
- 后端接受并严格校验：提示词去除首尾空格后非空且最多 8000 字符、`n=1..10`、14 种 `aspect_ratio`、`resolution=1k|2k`、文生图 `quality=low|medium`、`nsfw_check` 布尔值，以及最多 3 张参考图。
- 现有公共 `size` 映射为 Grok `aspect_ratio`；`image_resolution=1080p|1k` 映射为 `resolution=1k`，`2k` 保持 `2k`。
- 有参考图时前端隐藏并清除质量选择，后端兜底不发送 `quality`；无参考图时默认 `quality=medium`。
- Grok 前端只展示文档允许的 14 种比例和 1K/2K，不展示像素尺寸、自定义宽高、21:9 或 4K。
- Grok 设置提供 `nsfw_check` 开关，并在图片页、Canvas、电商套图与 Image Arena 既有任务链路中保持状态和提交参数一致。
- 定向测试、相关 Go 包、全量 Go、前端 lint/build、差异检查和浏览器 mock 验收通过。

## Context
- Repo: `F:/java/chatgpt2api`
- Source of truth: `https://docs.apimart.ai/cn/api-reference/images/grok-imagine-2.0-ext/official`
- Verified on: `2026-08-27`
- Current implementation: 公共模型为 `grok-imagine-1.5`，上游分别使用 `grok-imagine-1.5-apimart` 与 `grok-imagine-1.5-edit-apimart`，参考图上限 1，payload 仍发送 `size`。
- Downstream compatibility: `F:/mcplugins/sub2api` 当前实现已识别 `grok-imagine-image-2.0` 及本 contract 中的 2.0 参数；本 Sprint 不修改该仓库。

## Allowed Paths
- `internal/util/json.go`
- `internal/httpapi/sub2api.go`
- `internal/httpapi/routes.go`
- `internal/httpapi/canvas.go`
- `internal/httpapi/image_gateway_models_test.go`
- `internal/httpapi/canvas_test.go`
- `web/src/lib/api.ts`
- `web/src/lib/api.assert.ts`
- `web/src/lib/image-model-settings.ts`
- `web/src/lib/image-model-settings.assert.ts`
- `web/src/lib/image-parameters.ts`
- `web/src/components/image-model-settings-button.tsx`
- `web/src/app/image/components/image-composer.tsx`
- `web/src/app/image/components/image-arena-composer.tsx`
- `web/src/app/image/page.tsx`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.assert.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/lib/image-arena/image-arena-adapter.ts`
- `web/src/lib/image-arena/image-arena-agents.ts`
- `web/src/lib/image-arena/image-arena.assert.ts`
- `web/src/store/image-conversations.ts`
- `web/src/store/ecommerce-suite-projects.ts`
- `docs/workflow/worker-results/task-034-grok-imagine-image-2-profile-result.md`
- `docs/workflow/qa-reports/task-034-grok-imagine-image-2-profile-qa.md`

## Denied Paths
- `F:/mcplugins/sub2api/**`
- `internal/storage/**`
- `internal/service/**`
- `internal/config/**`
- `deploy/**`
- `.env*`
- `C:/Users/Administrator/.codex/memories/**`
- 数据库迁移、鉴权、权限、计费公式、APIMart 报价接口、Docker、部署和生产配置。

## Constraints
- 遵循仓库 `No compatibility layers`：直接以 2.0 替换 1.5，不保留旧别名、fallback、feature flag 或双路径。
- 保持现有 chatgpt2api -> Sub2API 异步任务/轮询架构，不在本 Sprint 重做幂等、响应版本头或报价系统。
- 14 种比例固定为：`1:1`、`3:4`、`4:3`、`9:16`、`16:9`、`2:3`、`3:2`、`9:19.5`、`19.5:9`、`9:20`、`20:9`、`1:2`、`2:1`、`auto`。
- `nsfw_check` 默认 `false`；不把它与仓库已删除的本地关键词预审混为一体。
- 参考图沿用既有上传/公共 URL 整理链路，不实现新的上传 API。
- 不硬编码 APIMart 价格，不改变消费、退款或结算语义。
- 只做精确补丁，不回滚或覆盖工作区既有 Task-025..031、拼豆、Gemini Flash 和其它用户改动。

## Acceptance Commands
```powershell
go test ./internal/httpapi -run "Test.*(Grok|CanvasImageModel)" -count=1
go test ./internal/httpapi ./internal/util -count=1
go test ./...
cd web
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check -- internal/util/json.go internal/httpapi/sub2api.go internal/httpapi/routes.go internal/httpapi/canvas.go internal/httpapi/image_gateway_models_test.go internal/httpapi/canvas_test.go web/src/lib/api.ts web/src/lib/api.assert.ts web/src/lib/image-model-settings.ts web/src/lib/image-model-settings.assert.ts web/src/lib/image-parameters.ts web/src/components/image-model-settings-button.tsx web/src/app/image/components/image-composer.tsx web/src/app/image/components/image-arena-composer.tsx web/src/app/image/page.tsx web/src/app/canvas/canvas-node.tsx web/src/app/canvas/canvas-utils.assert.ts web/src/app/canvas/use-smart-canvas-controller.ts web/src/app/ecommerce-suite/page.tsx web/src/lib/image-arena/image-arena-adapter.ts web/src/lib/image-arena/image-arena-agents.ts web/src/lib/image-arena/image-arena.assert.ts web/src/store/image-conversations.ts web/src/store/ecommerce-suite-projects.ts
```

## Browser Acceptance
- Grok 文生图无参考图时可选择 14 种比例、1K/2K、Low/Medium 与 `nsfw_check`，请求参数与 UI 一致。
- 添加第 1 张参考图后质量控件消失；请求无 `quality`。
- 可添加并提交 3 张参考图，达到 3 张后不可继续添加。
- 旧保存状态中的 4K、21:9、像素尺寸或 high quality 不会按非法 Grok 参数提交。
- Canvas 至少覆盖 2K、`nsfw_check=true` 与 3 张参考图的请求体。

## Output
- `docs/workflow/worker-results/task-034-grok-imagine-image-2-profile-result.md`
- `docs/workflow/qa-reports/task-034-grok-imagine-image-2-profile-qa.md`
- Worker report 第一行必须是 `### DONE: task-034-grok-imagine-image-2-profile`、`### BLOCKED: task-034-grok-imagine-image-2-profile` 或 `### FAILED: task-034-grok-imagine-image-2-profile`。

## Stop Rules
- 如果必须修改 Sub2API、计费、数据库、鉴权、部署、Docker 或生产配置，停止并报告 `BLOCKED`。
- 如果 2.0 必须保留 1.5 alias 或通过 `images/edits` 才能工作，停止并回 Planner 裁决。
- 如果 Grok 参数无法在允许路径内与现有图片任务状态传播解耦，先给出具体调用链证据再申请 contract amendment。
- 不得覆盖或回滚工作区中不属于本 task 的既有改动。

## Budget
- worker_mode: `codex-direct`
- qa_worker_mode: `codex-direct`
- worker_model: `gpt-5.6-sol`
- qa_worker_model: `gpt-5.6-sol`
- max_budget_usd: `n/a`
