### DONE: task-019-canvas-node-ergonomics

## Changed Files

- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/page.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- Task-019 workflow artifacts.

## Result

- Output 按 1/2/3-4 张分别使用单列、两列和 2x2，并用 `object-contain` 填满剩余预览区域。
- 图片生成 full 模式取消固定高度和内部滚动，按钮改为“展开参数/收起参数”，参数区 wheel 与 Canvas zoom 隔离。
- controller 新增页面会话内样式快照，支持普通与 Pro Studio 样式复制/粘贴，并显式排除 prompt、输入素材、任务/结果、批次和几何字段。
- 运行中节点禁止粘贴；复制、粘贴与视图切换不提交生成请求。

## Verification

- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS.
- `go test ./...`: PASS（使用 E 盘专用 `GOTMPDIR/GOCACHE`）。
- Canvas Playwright smoke: PASS, 13/13.
- Task-019 scoped `git diff --check`: PASS，仅 Windows LF/CRLF 提示。
