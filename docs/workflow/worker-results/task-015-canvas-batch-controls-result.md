### DONE: task-015-canvas-batch-controls

## Changed Files

- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/page.tsx`
- `docs/workflow/**`

## Implementation

- 新增画布级 prompt-split 批次工具条，显示批次序号与完成、进行、失败、等待统计。
- 支持前后切换、定位、整理和确认删除当前批次；活动任务批次禁止删除。
- 整理当前批次时按 `prompt_split_index` 稳定排列，每行最多两组，保留节点持久化宽高并避开其他节点。
- zoom `<0.4` 时 fan-out 图片生成与 Output 节点显示序号、状态、模型/结果数量摘要；其他批次适度弱化。
- 新批次出现后工具条自动切换到最新批次；节点选择变化时同步当前批次。

## Commands Run

- `npm.cmd run lint`
- `npm.cmd run build`
- `node docs/workflow/evidence/task-015-canvas-batch-controls/browser-smoke.cjs`
- `node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- `git diff --check -- web/src/app/canvas/canvas-node.tsx web/src/app/canvas/use-smart-canvas-controller.ts web/src/app/canvas/page.tsx docs/workflow`

## Contract Compliance

- 未修改后端 API、数据库、计费、Sub2API、creation-task 或素材侧栏。
- 未增加批量生成/取消语义；定位、整理、删除取消和缩放均不提交任务。
- 未重置用户修改的节点尺寸或视图模式。

## Risks

- Task-013 creation-task restart recovery P1 仍未解决。
- 浏览器 QA 使用 API mock，不消费真实上游模型额度。
