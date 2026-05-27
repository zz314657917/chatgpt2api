---
task_id: canvas-sprint-003-error-details
role: generator-worker
status: implemented
qa_mode: browser
last_verified: 2026-05-27
---

# Canvas Sprint 003 Error Details

## Goal
- 新增一个可直接集成到 `/canvas` 的运行错误详情格式化模块。
- 模块只负责把画布节点或任务错误整理成 UI 可展示结构，不接入页面，不触发网络请求。

## Scope
- Owned code path: `web/src/app/canvas/canvas-error-details.ts`
- Owned workflow doc: `docs/workflow/tasks/canvas-sprint-003-error-details.md`
- 不修改 controller、page、canvas-node、types 或其他共享文件。

## Core API
- `SmartCanvasErrorDetail`
- `SmartCanvasErrorMetadata`
- `SmartCanvasErrorStatus`
- `SmartCanvasErrorDetailInput`
- `buildSmartCanvasErrorDetail(input)`
- `formatSmartCanvasErrorMessage(error, fallback?)`
- `isRetryableCanvasError(input)`

## Output Shape
- `title`: 面向 UI 的错误标题。
- `message`: 面向 UI 的错误说明。
- `status`: 归一化后的运行状态。
- `taskId`: 任务 ID，优先读取 `data.task_id`。
- `retryable`: 当前错误是否适合直接重试。
- `technicalDetail`: 原始错误或结构化错误的技术细节。
- `metadata`: 可展示的节点、任务和模型参数信息。

## Integration Points
- `/canvas` 节点详情、运行记录、toast 或错误弹窗可调用 `buildSmartCanvasErrorDetail(item)`。
- 轮询 `CreationTask` 失败后可调用 `buildSmartCanvasErrorDetail(task)`，或传入 `{ task, data: item.data }` 保留节点上下文。
- UI 只需要消费结构化结果，不需要重复解析 `item.data.error`、`status`、`task_id`、`tool_type`、`prompt`、`model`、`size`。

## Acceptance Commands
```powershell
cd web
npm.cmd run build
```

## Not Integrated Risks
- 当前模块尚未被 `/canvas` 页面接入，实际展示样式、按钮显隐和交互仍取决于后续集成。
- `retryable` 是基于状态和错误文本的保守判断，接入重试按钮前仍需确认具体节点是否具备完整输入。
- `metadata.prompt` 会截断为展示友好的长度，完整提示词仍应从原始节点数据读取。
