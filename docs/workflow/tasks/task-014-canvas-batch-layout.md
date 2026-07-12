---
task_id: task-014-canvas-batch-layout
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-11
---

# Task 014: Canvas Batch Layout And Resizable Nodes

## Role
Generator

## Goal

收口 AI 提示词 fan-out 的画布密度：自动生成的图片节点使用紧凑态，图片生成与 Output 可持久化缩放，批次无重叠排布，重复拆分由用户选择保留或替换。

## Success Criteria

- fan-out 图片生成节点默认 `compact`，约 `340 x 270`；手动模板默认 `full`。
- Output 默认约 `320 x 220`；图片生成与 Output 均有缩放手柄和类型化尺寸边界。
- fan-out pair 每行最多两组，使用持久化尺寸做碰撞检测，保留批次时寻找空白区域。
- 重复拆分弹窗提供“保留并新建”“替换上一批”“取消”；替换失败时旧批次不丢失。
- 视图切换、缩放和弹窗选择不额外提交 prompt-split 或图片任务。

## Allowed Paths

- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `docs/workflow/**`

## Denied Paths

- 后端、数据库、迁移、部署配置、Sub2API、计费和既有 creation-task API。
- `web/src/app/canvas/page.tsx`、素材侧栏、`knowledge/**`、全局 memories。
- 新依赖、自动迁移旧画布、删除未确认的历史结果。

## Constraints

- 旧节点缺少 `node_view` 时保持完整态。
- 只给 fan-out 新节点写入紧凑尺寸；模板节点不得被改写。
- 替换意图持久化到 LLM 节点，刷新后仍能在新 batch 可用时完成清理。
- 已存在的 `batch_id + index` 幂等恢复语义和 direct 子任务轮询保持不变。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
```

## Browser QA Scenarios

- 3/10 条 compact pair 无 DOM 边界交叠，长 prompt 不改变稳定高度。
- compact/full 切换不提交任务；缩放达到类型边界并在刷新后恢复。
- 重跑弹窗取消不提交；保留模式旧批次不变且新批次避让；替换模式新批次 ready 后才删除旧 pair。
- direct 模式仍固定 `n=1`，节点状态和任务绑定独立恢复。

## Output

- `docs/workflow/worker-results/task-014-canvas-batch-layout-result.md`
- `docs/workflow/qa-reports/task-014-canvas-batch-layout-qa.md`
- 更新 `docs/workflow/status.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要改后端 API、数据库、支付、部署配置或新增依赖时停止。
- 无法在新 batch 可用前保留旧结果时停止并回 Codex 裁决。
- 发现会覆盖 `page.tsx`、素材侧栏或用户无关 dirty hunk 时停止。
