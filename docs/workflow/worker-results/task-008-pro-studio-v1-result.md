### DONE: task-008-pro-studio-v1

# Worker Result

## Task ID
task-008-pro-studio-v1

## Status
`done`

## Summary
- 完成 Pro Studio / 生产模式 v1：前端新增共享 `web/src/lib/pro-studio/**` 与 `web/src/components/pro-studio/**`，Canvas 和 Ecommerce 复用同一套 official 参数、预设、payload、validation 与 batch split。
- Canvas 图片生成节点支持普通/生产模式切换；生产模式锁定 `gpt-image-2-official`，提交 payload 包含 `professional_mode`、`pro_studio`、`official_settings`，并保留 public reference image URLs / mask URL 路径。
- Ecommerce 项目支持商品主图、电商横幅、详情页竖图、场景图、SKU 批量图；SKU 批量按 official `n<=4` 拆任务并显示 batch preview。
- 后端 creation-task 与图片资产 metadata 增加 Pro Studio 强校验、official 锁模、WebP/JPEG compression、`1k|2k|4k` resolution 保留和 public response 字段。
- 素材库详情和 Canvas 运行节点补充 Pro Studio badge/metadata 展示。

## Changed Files
- `docs/workflow/spec.md`
- `docs/workflow/status.md`
- `docs/workflow/task-008-contract-review.md`
- `docs/workflow/tasks/task-008-pro-studio-v1.md`
- `internal/httpapi/app.go`
- `internal/httpapi/app_test.go`
- `internal/httpapi/routes.go`
- `internal/service/image.go`
- `internal/service/image_parameters.go`
- `internal/service/image_parameters_test.go`
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`
- `internal/service/image_test.go`
- `internal/service/pro_studio.go`
- `internal/service/pro_studio_test.go`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/app/image-manager/page.tsx`
- `web/src/components/pro-studio/batch-job-preview.tsx`
- `web/src/components/pro-studio/pro-studio-badge.tsx`
- `web/src/components/pro-studio/pro-studio-panel.tsx`
- `web/src/lib/api.ts`
- `web/src/lib/pro-studio/**`
- `web/src/store/ecommerce-suite-projects.ts`

## Commands Run
```text
go test ./internal/service -run 'Test(ImageServiceImageDetailReturnsProStudioMetadata|ImageTaskServicePreservesProStudioMetadata|NormalizeProStudioRequest|ValidateProStudioRequest)' -count=1 -> pass
go test ./internal/httpapi -run 'TestCreationTaskProStudio' -count=1 -> pass
go test ./internal/service ./internal/httpapi -count=1 -> pass
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint" -> pass
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build" -> pass
go test ./... -> pass
Browser smoke: /canvas Pro Studio production mode -> pass, screenshot output/playwright/pro-studio-canvas-production-mode.png
Browser smoke: /ecommerce-suite Pro Studio + SKU 8/12 batch preview -> pass, screenshots output/playwright/pro-studio-ecommerce-smoke.png and output/playwright/pro-studio-ecommerce-sku-batch-smoke.png
```

## Test Output
```text
Canvas smoke: page loaded, base Prompt -> 图片生成 -> Output nodes rendered, production mode switched on, gpt-image-2-official lock visible, no app console errors.
Ecommerce smoke: project created, production mode switched on, 商品主图 / 电商横幅 / 详情页竖图 / 场景图 / SKU 批量图 visible, gpt-image-2-official lock visible, no app console errors.
SKU preview: 8 张 -> 任务 1: 4 张 + 任务 2: 4 张; 12 张 -> 任务 1: 4 张 + 任务 2: 4 张 + 任务 3: 4 张.
```

## Risks
- 未执行真实上游 `gpt-image-2-official` 生成请求；本轮覆盖参数构造、校验、metadata、UI smoke 和 batch preview。
- 未验证真实 Sub2API 生产登录/充值/扣费闭环；仍需部署域名、internal secret、支付配置和真实账号后做 E2E。
- 浏览器 smoke 使用本机临时 admin session helper 进入受保护页面，未改变产品登录行为；helper 和 `go run` 服务已清理。
- Browser 工具层出现一次外部 Statsig 上报超时，不属于本地应用控制台错误；页面 `tab.dev.logs({levels:["error"]})` 为空。

## Knowledge Candidates
- Pro Studio metadata 中 official resolution 应保留 `1k|2k|4k`，不要在任务或图片资产 metadata 中写回 `1080p`。
- official Pro Studio compression 支持 JPEG/WebP；PNG 不应带 compression。
- Ecommerce official 批量任务应在前端按 `n<=4` 拆分，后端继续拒绝单请求 `n>4`。

## Contract Compliance
- allowed_paths_only: `yes`
- denied_paths_touched: `no`
- success_criteria_met: `yes`
- stop_rules_triggered: `no`

## Blocked Reason
- 无。
