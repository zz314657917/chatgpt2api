---
task_id: task-019-canvas-node-ergonomics
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-13
---

# Task 019: Canvas Node Ergonomics

## Role

Generator

## Goal

修正 Output 图片预览空间利用、图片生成参数展开与滚轮隔离，并提供页面会话内的图片生成样式复制/粘贴。

## Success Criteria

- Output 单图填满可用预览区并使用 `object-contain`；2 张两列，3 到 4 张使用 2x2，节点缩放时预览同步增大。
- 图片生成节点按钮显示“展开参数/收起参数”；full 模式由内容自动增高且没有内部纵向滚动条。
- 参数区 wheel 不改变 Canvas viewport zoom，空白画布 wheel 缩放保持有效。
- compact/full 操作区均提供复制样式和粘贴样式；粘贴完整覆盖样式白名单并清理不兼容旧字段。
- 样式复制不包含 prompt、输入素材、任务与结果、批次、位置、尺寸和 node view；运行中节点不可粘贴。
- 剪贴板仅在当前页面内存中存在，刷新后清空；已粘贴节点参数仍按普通 Canvas 数据持久化。
- 复制、粘贴、展开和收起均不提交 prompt-split 或图片任务。

## Allowed Paths

- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/page.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- `docs/workflow/**`

## Denied Paths

- 后端 API、数据库、Sub2API、计费、creation-task 与 prompt-split 编排。
- `knowledge/**`、素材侧栏和其它工作台。
- 系统剪贴板、新依赖和 Canvas 持久化 schema。

## Constraints

- 样式快照白名单包含模型、画幅/尺寸/分辨率、质量、格式/压缩、张数、可见性、模型专属设置与 Pro Studio 配置。
- 粘贴保留目标节点自己的内容、输入素材、结果、任务状态、批次、位置、尺寸和视图模式。
- full 模式更新实际 DOM 测量边界，但不自动移动其它节点。
- Task-017/018 和素材侧栏现有 dirty changes 必须保留，不得回滚或扩大修改范围。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
```

## Output

- `docs/workflow/worker-results/task-019-canvas-node-ergonomics-result.md`
- `docs/workflow/qa-reports/task-019-canvas-node-ergonomics-qa.md`
- 更新 `docs/workflow/status.md`、`docs/workflow/spec.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要修改后端任务、计费、数据库或 prompt-split API 时停止并回 Planner。
- 无法在不复制输入素材/任务数据的前提下定义稳定样式白名单时停止。
