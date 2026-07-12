---
task_id: task-015-canvas-batch-controls
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-12
---

# Task 015: Canvas Batch Controls And Zoom LOD

## Role

Generator

## Goal

让 AI 提示词 fan-out 在 3 到 10 组节点时仍可快速识别、定位和整理：增加批次工具条、当前批次一键整理，以及低缩放层级显示。

## Success Criteria

- Canvas 存在 prompt-split fan-out 时显示批次工具条，展示批次序号、完成/运行/失败/等待统计。
- 用户可在多个批次间切换，并定位到当前批次；当前批次节点高亮，其他 prompt-split 批次适度淡化。
- “整理批次”只重新排列当前批次的图片生成与 Output 节点，保持每行最多两组、尊重节点持久化尺寸，并避开不属于当前批次的现有节点。
- “删除批次”需要确认，只删除当前批次 fan-out 节点及相关边，不删除来源 AI 节点、模板节点或其他批次。
- viewport zoom 低于 `0.4` 时，fan-out 图片生成与 Output 使用稳定的低缩放摘要，显示序号、状态、模型或结果数量；恢复到阈值以上时展示原节点内容。
- 批次切换、定位、整理、删除取消和缩放显示均不提交 prompt-split 或图片任务。

## Allowed Paths

- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/page.tsx`
- `docs/workflow/**`

## Denied Paths

- 后端、数据库、迁移、部署配置、Sub2API、计费和 creation-task API。
- `web/src/app/canvas/types.ts`、`web/src/app/canvas/canvas-utils.ts`，除非现有类型无法表达且先回 Planner 审核。
- 素材侧栏、`knowledge/**`、全局 memories、新依赖。
- 批量生成、批量取消或修改 Task-013 prompt-split 执行语义。

## Constraints

- 不增加节点间连线；保留现有 generator 到 Output 的既有边。
- 不重置用户修改的节点宽高或 `node_view`。
- 整理算法使用现有节点尺寸字段；同一 batch 的 `prompt_split_index` 决定稳定顺序。
- 工具条是画布级 UI，移动端不得遮挡既有单按钮工具入口。
- Task-013 creation-task restart recovery P1 保持独立未解决。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
node docs/workflow/evidence/task-015-canvas-batch-controls/browser-smoke.cjs
```

## Browser QA Scenarios

- 3 条与 10 条批次显示正确统计，多个批次可切换、定位和高亮。
- 手动移动/缩放节点后整理当前批次，DOM 边界无交叠，其他批次与模板位置不变。
- 低于/高于 `0.4` 缩放阈值时摘要与完整内容正确切换，节点尺寸不变化。
- 删除取消零变化；确认删除只移除当前 fan-out pair，来源 AI 节点与其他批次保留。
- 所有纯画布动作不新增 `/prompt-splits` 或图片任务请求。

## Output

- `docs/workflow/worker-results/task-015-canvas-batch-controls-result.md`
- `docs/workflow/qa-reports/task-015-canvas-batch-controls-qa.md`
- 更新 `docs/workflow/status.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要改后端 API、数据库、计费、部署配置或新增依赖时停止。
- 需要批量提交或取消任务才能完成工具条时停止并拆分新 contract。
- 无法在不移动其他批次/模板的情况下整理当前批次时停止并回 Planner。
