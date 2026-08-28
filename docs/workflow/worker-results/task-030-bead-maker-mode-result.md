### DONE: task-030-bead-maker-mode

# Worker Result

## Scope

- 在现有拼豆工作台内实现平板友好的制作模式，不复制 `AngKernel/pindou-studio` 的 AGPL 源码。
- 增加最少色块转换参数，并贯通前端工程、转换算法、adapter 和 Go 校验。

## Implemented

- 新增 `maker-mode.tsx`：豆板分区、当前板/全图、缩略图定位、颜色高亮、隐藏完成、进度、板间导航、缩放、防误触锁和屏幕常亮降级提示。
- 工程 v1 文档新增 `maker_state`，保存 `active_board_index` 与 `completed_cells`。
- `withCells`、`withLayers` 和 `normalizeProject` 按最新合成格子清理完成索引，避免编辑后保留无效进度。
- 新增 `minColorBlockSize`，范围 1-500；阈值大于 1 时合并过小的相邻连通色块，阈值 1 保持原逻辑。
- 修正 `normalizeMakerBoardIndex` 的可选数值收窄。

## Verification

- `npm.cmd run lint`：PASS，保留 2 条 `workspace-canvas.tsx` 既有 hooks warning。
- `npm.cmd run build`：PASS。
- `npm.cmd run check:bundle`：PASS；拼豆页 169.4 KiB，总产物 4590.4 KiB。
- `go test ./internal/service ./internal/httpapi -count=1`：PASS。
- `go test ./...`：PASS。
- `git diff --check`：PASS。

## Browser Evidence

- `output/playwright/task-030-maker-1024.png`
- `output/playwright/task-030-maker-mobile.png`
- 5 格 mock 图案：点击非空格后当前板/整体由 0% 变为 20%；锁定后点击不改变进度。
- 下一板显示第 1 行第 2 列；全图点击定位到第 2 行第 1 列；刷新后当前板与 20% 进度恢复。
- 390px 与 1024px 视口横向溢出检查均为 false，越界按钮数均为 0。
- 直接调用 `imageFileToBeads`：同一 3x1 图片的最少色块阈值 1 输出 2 色，阈值 2 输出 1 色。

## Boundaries

- 使用 mock 会话/API，未验证真实账号、对象存储或嵌入式服务部署。
- 浏览器控制台另有既有 `http://127.0.0.1:8000/api/canvases` 连接拒绝，与本 Sprint 拼豆页面无关。
