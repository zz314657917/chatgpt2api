# Task 017 Worker Result

### PASS: task-017-prompt-split-failed-rerun

## Changed Files

- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`

## Result

- “上一批”改为检查当前 batch 在画布上是否存在同源图片生成或 Output fan-out 节点。
- 失败 `0/N` 批次保留错误状态和 batch ID，但再次点击直接重试，不弹批次处理对话框。
- 增加第一次失败、第二次成功的 browser mock 场景，并断言不写替换标记。

## Verification

- `npm.cmd run lint`：PASS。
- `npm.cmd run build`：PASS。
- 新失败重试场景：PASS。
- Canvas browser smoke：PASS，11/11。
