### DONE: task-016-canvas-topbar-batch-controls

## Changed Files

- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/page.tsx`
- `docs/workflow/**`

## Implementation

- 将当前 prompt-split 批次状态提升到 Canvas 控制器，由 TopBar 与 Board 共享。
- 批次控制移动到桌面顶部节点按钮组左侧，不再作为画布内第二行绝对定位浮层。
- 批次状态改为紧凑图标计数；1365px 下节点按钮自动使用图标态，避免顶部溢出。
- 有批次时桌面画布标题让出左侧空间；移动端继续使用现有单按钮工具入口。
- 批次切换、定位、整理、删除确认和节点高亮行为保持不变。

## Commands Run

- `npm.cmd run lint`
- `npm.cmd run build`
- `node docs/workflow/evidence/task-016-canvas-topbar-batch-controls/browser-smoke.cjs`
- `node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- `git diff --check -- web/src/app/canvas/canvas-node.tsx web/src/app/canvas/use-smart-canvas-controller.ts web/src/app/canvas/page.tsx docs/workflow`

## Contract Compliance

- 未修改节点排布算法、节点尺寸、后端 API、任务提交、计费、数据库或 Sub2API。
- 未恢复用户取消的向下单列布局改动。
- 未新增节点持久化字段或依赖。

## Risks

- Task-013 creation-task restart recovery P1 仍未解决。
- 浏览器 QA 使用 API mock，不消费真实上游额度。
