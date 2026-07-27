### DONE: task-021-generator-node-responsive-parameters

## Changed Files

- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- Task-021 workflow artifacts.

## Result

- 图片生成 full 参数区继续由内容自然撑高，不引入内部滚动容器。
- 参数布局按节点宽度自动切换：小于 `360px` 单列、`360px..519px` 双列、`520px` 及以上三列。
- 参数区通过 non-passive wheel listener 阻止默认页面滚动和 Canvas zoom；空白画布 wheel 缩放保持不变。
- compact 模式、样式复制粘贴、生成请求和节点持久化语义未修改。

## Verification

- `npm.cmd run lint`: PASS。
- `npm.cmd run build`: PASS。
- `go test ./...`: PASS。
- Canvas Playwright smoke: PASS，13/13。
- Task-021 scoped `git diff --check`: PASS，仅 Windows LF/CRLF 提示。
