# Task 031: Canvas Model Contracts

## Task ID
task-031-canvas-model-contracts

## Role
在 P/G/E 流程中实现已批准的 Canvas 模型参数契约修复。仅执行本 contract，不扩大模型目录、计费、鉴权或部署范围。

## Goal
使 Gemini Flash 在 Canvas 中始终提交单张图片，并使视频生成只接受本项目已定义参数 profile 的模型，避免将未知模型按 Seedance 默认规则调用。

## Success Criteria
- 两个 Gemini Flash 模型的 Canvas 张数控件和 `createImageGenerationTask` 最终请求均为 `n=1`。
- Canvas 视频模型下拉列表不显示未定义 profile 的模型；已保存的未知模型不可提交。
- 后端 `videos/generations` bridge 在收到未知模型时不发送上游请求，并返回明确错误。
- Kling、Wan、VEO、Seedance 的现有归一规则和已有定向测试继续通过。

## Context
- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`
- Related files: `web/src/lib/api.ts`, `web/src/app/canvas/canvas-node.tsx`, `web/src/app/canvas/use-smart-canvas-controller.ts`, `internal/httpapi/video.go`。

## Allowed Paths
- `web/src/lib/api.ts`
- `web/src/lib/api.assert.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `internal/httpapi/video.go`
- `internal/httpapi/app_test.go`
- `docs/workflow/**`

## Denied Paths
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- `deploy/**`, Docker 配置、Sub2API、计费、鉴权、数据库迁移和素材库 API。

## Constraints
- 保持当前规范模型 ID，不在本 Sprint 增加 Apimart 兼容别名或 `official_fallback` UI。
- 不为未知视频模型引入兼容默认值；必须拒绝而不是猜测参数。
- 保持更改最小，不重构既有 Canvas 节点或模型目录协议。
- 不回滚或覆盖工作区既有改动。

## Acceptance Commands
```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./internal/httpapi -run "Test(Sub2APIVideo|Sub2APIGemini|Canvas)" -count=1
go test ./internal/httpapi ./internal/service -count=1
git diff --check
```

## Output
- `docs/workflow/worker-results/task-031-canvas-model-contracts-result.md`
- `docs/workflow/qa-reports/task-031-canvas-model-contracts-qa.md`

## Stop Rules
- 如需修改 Sub2API 上游协议、计费、鉴权、数据库迁移或部署，停止并回 Planner。
- 如真实 API 文档要求额外的模型 profile 字段且未提供可靠证据，停止并报告缺少的契约。
- 任何允许路径外的变更需求都必须先获得新的 contract。
