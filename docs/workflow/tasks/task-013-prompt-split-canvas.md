---
task_id: task-013-prompt-split-canvas
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-11
---

# Task 013: Canvas Prompt Split And Mini Node

## Role
Generator

## Goal

在 `/canvas` 的 AI 提示词节点中实现一次性文本拆分、持久化 direct batch 和紧凑节点 UI；每条拆分结果对应一个独立的文生图节点与结果节点，最多 10 条。

## Success Criteria

- `POST /api/creation-tasks/prompt-splits`、查询和取消端点使用 owner-scoped、持久化的批次记录。
- splitter 只接受严格 JSON 的唯一、非空提示词数组，数量必须精确匹配 `split_count`；解析失败时没有图片子任务。
- `direct` 批次先提交一个 billable chat task，再为每条 prompt 提交独立 `n=1` generation task；已成功子项不因兄弟失败而回滚。
- Canvas 的非直接模式创建 X 组图片生成/结果节点，不提交图片任务；直接模式把 batch child task 绑定到同样的 X 组节点。
- Canvas 只接受文本到图像模板；有参考图、mask、图生图、视频或多个直接下游图片生成模板时给出明确阻断。
- AI 提示词节点默认 mini 尺寸为约 `330 x 260`，完整编辑与结果详情以 Dialog 打开。

## Context

- 既有 async task 根资源为 `/api/creation-tasks`，`ImageTaskService` 负责幂等、计费、队列和子任务状态。
- `internal/httpapi/app.go` 已注入 chat/generate handler，不能绕过其 Sub2API 和 billing 路径。
- `web/src/app/canvas/use-smart-canvas-controller.ts` 已有 LLM task 和 generator polling；当前用户的素材侧栏 dirty hunk 位于不相关的 media-type setter，必须保留。
- `task-012-text-asset-collections` 已存在，因此本任务使用唯一 ID `task-013-prompt-split-canvas`。

## Allowed Paths

- `internal/service/prompt_split.go`
- `internal/service/prompt_split_test.go`
- `internal/httpapi/app.go`
- `internal/httpapi/routes.go`
- `internal/httpapi/prompt_split.go`
- `internal/httpapi/prompt_split_test.go`
- `web/src/lib/api.ts`
- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `docs/workflow/**`

## Denied Paths

- 数据库 schema、迁移、部署配置、`.env*`、密钥、token、cookie。
- Sub2API 支付、登录、launch token 或 bridge 协议。
- `web/src/app/canvas/page.tsx` 及现有素材侧栏组件。
- `knowledge/**`、`C:/Users/Administrator/.codex/memories/**`。
- 新增第三方依赖或修改既有 `/api/creation-tasks/image-generations` / `chat-completions` API 契约。

## Constraints

- 保持现有 creation-task、内容策略、并发和 billing 边界；direct 模式不得直接调用 engine。
- batch 的 child ID 必须由 batch ID 和 index 确定，以便重复 POST 和服务重启安全恢复。
- 不做兼容层或 feature flag；旧 Canvas 未存 split 字段时按 `split_count=1` 的既有单提示词行为处理。
- 直接模式仅支持可序列化的纯文生图参数，强制 `n=1`。
- 不回滚、不覆盖当前工作区已有的无关改动。

## Acceptance Commands

```powershell
gofmt -w internal/service/prompt_split.go internal/service/prompt_split_test.go internal/httpapi/prompt_split.go internal/httpapi/prompt_split_test.go internal/httpapi/app.go internal/httpapi/routes.go
go test ./internal/service ./internal/httpapi -run "PromptSplit" -count=1
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
```

## Browser QA Scenarios

- AI 提示词节点可见 mini 高度，长文本和长拆分结果只在 Dialog 展开。
- 选择 3/10 条、关闭直接生图时，生成同数量的独立图片生成/结果节点且没有图片 task 请求。
- 开启直接生图时，创建同数量节点并将每条 child task 绑定至各自结果节点。
- 非法数量、错误 JSON、部分失败、取消和刷新恢复都不重复创建或扣费。
- `split_count=1` 的原有单提示词流程保持可用。

## Output

- `docs/workflow/worker-results/task-013-prompt-split-canvas-result.md`
- `docs/workflow/qa-reports/task-013-prompt-split-canvas-qa.md`
- 更新 `docs/workflow/status.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要修改 denied paths、数据库 schema、支付/bridge 协议、部署配置或新增依赖时停止并回 Codex 裁决。
- 没有可确定的单一纯文生图模板、或模板带输入图片/蒙版时，不提交 direct batch。
- 任何拆词解析失败、额度/RPM 批量准入失败或子任务失败都记录状态；不得取消已经成功的兄弟任务。
