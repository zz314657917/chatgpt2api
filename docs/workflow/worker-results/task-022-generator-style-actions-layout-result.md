### DONE: task-022-generator-style-actions-layout

## Changed Files

- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- Task-022 workflow artifacts.

## Result

- 图片生成 full 模式的复制样式、粘贴样式和收起参数已从 Prompts 上方移至参数区底部、输出预览之前。
- 操作栏可随窄节点换行，保留图标按钮的可访问名称、提示文本、禁用条件及原有复制/粘贴回调。
- 修正 Canvas smoke 中两个真实交互前置条件：样式复制场景的节点不再重叠，输出缩放场景先适配到可视区域并验证鼠标实际命中缩放按钮。
- 未改动样式复制数据、Canvas schema、任务请求、后端或 Sub2API。

## Verification

- `npm.cmd run lint`: PASS，0 warnings / 0 errors。
- `npm.cmd run build`: PASS。
- `go test ./...`: PASS。
- Canvas Playwright smoke: PASS，13/13。
- Task-022 scoped `git diff --check`: PASS，仅 Windows LF/CRLF 提示。
