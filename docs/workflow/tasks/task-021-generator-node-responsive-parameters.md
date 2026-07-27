---
task_id: task-021-generator-node-responsive-parameters
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-28
---

# Task 021: Generator Node Responsive Parameters

## Role

Generator

## Goal

让 Canvas 图片生成节点的完整参数随节点宽度自动重排，彻底移除参数区内部滚动，并阻止节点滚轮继续滚动页面或缩放 Canvas。

## Success Criteria

- 图片生成节点 full 模式不设置固定高度，也不出现内部纵向滚动条。
- 节点拖窄时参数控件改为单列，常规宽度保持双列，拖宽后使用三列以减少节点高度。
- 参数区上的 wheel 事件被消费，不改变页面滚动位置，也不改变 Canvas viewport。
- 空白 Canvas 上的 wheel 缩放保持有效。
- compact 模式、生成请求、任务状态、样式复制粘贴和持久化字段语义保持不变。

## Allowed Paths

- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- `docs/workflow/**`

## Denied Paths

- 后端 API、数据库、Sub2API、计费、creation-task 和 prompt-split 编排。
- 其它节点类型、素材侧栏、Canvas 持久化 schema 和新依赖。
- `knowledge/**`。

## Constraints

- 不使用缩放字体或 CSS transform 压缩交互控件；通过响应式重排适配节点宽度。
- full 模式以内容高度为准，持久化 `height` 只作为最小高度。
- 不恢复旧的 `overflow-auto` 或增加独立滚动容器。
- 保留当前工作区中 Task-017 至 Task-020 及其它未提交改动。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
```

## Output

- `docs/workflow/worker-results/task-021-generator-node-responsive-parameters-result.md`
- `docs/workflow/qa-reports/task-021-generator-node-responsive-parameters-qa.md`
- 更新 `docs/workflow/status.md`、`docs/workflow/spec.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要修改后端任务、计费、数据库或 Canvas schema 时停止并回 Planner。
- 无法同时保持控件可读性、无内部滚动和现有节点缩放语义时停止并重新设计。
