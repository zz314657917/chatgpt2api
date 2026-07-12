### DONE: task-014-canvas-batch-layout

## Changed Files

- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- Task-014 workflow and browser evidence files.

## Result

- fan-out 图片生成节点默认 compact `340 x 270`，Output 默认 `320 x 220`。
- 图片生成与 Output 支持类型化持久化缩放、compact/full 切换和内部滚动。
- 两列 pair 网格纳入当前批次与历史节点碰撞检测，保留批次不重叠。
- 重复拆分弹窗支持保留、替换、取消；替换只在新 prompts ready 后清理旧 pair。

## Commands

- `npm.cmd run lint` PASS
- `npm.cmd run build` PASS
- Canvas browser smoke PASS（8 scenarios）
- `git diff --check` PASS（仅 line-ending warning）

## Risks

- 本 Sprint 不处理 Task-013 的服务进程重启恢复 P1。
