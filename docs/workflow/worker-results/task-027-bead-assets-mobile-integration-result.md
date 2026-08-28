### DONE: task-027-bead-assets-mobile-integration

## Changed Files

- `web/src/app/beads/page.tsx`：加入 1200 ms 串行自动保存、保存状态、409 冲突处置、素材运行时恢复、上传代号和路由代号隔离。
- `web/src/app/beads/bead-asset-picker.tsx`：复用现有素材 API，限制团队/上传权限，并让选择器关闭或新请求同步作废旧详情、Blob 与上传请求。
- `web/src/app/beads/upstream/workbench-app.tsx`、`web/src/app/beads/upstream/upstream.css`、`web/src/app/beads/beads.css`：接入本地/素材库图片、PNG 回存和移动端抽屉、深浅色顶栏。
- `output/playwright/task-027-browser-qa.js`：覆盖保存、409、素材、PNG、路由隔离、关闭选择器后的旧详情读取、另存副本忙碌状态及移动布局。

## Implemented Behavior

- 保存队列以编辑版本、请求代号和工程 generation 串行化。旧工程或旧请求的保存响应不能覆盖当前路由；网络失败保留草稿并暂停自动重试。
- 409 只提供重新加载、另存副本和取消。冲突操作绑定会话代号，处理中禁用其余冲突动作和 Escape 关闭，迟到的副本创建不会跳转新工程。
- 工程仅保存白名单素材引用；临时 URL、Blob 与 File 均留在运行时。个人和团队素材读取分别受现有 `GET /api/images` 权限控制，上传和 PNG 回存分别受既有上传权限控制。
- PNG 下载与回存共用相同渲染 Blob；移动端复用同一工作台状态，通过中文无障碍名称的底栏打开工具、图片、色板、图层、统计和调整抽屉。

## Commands Run

- `npm.cmd run lint`：通过，保留 `workspace-canvas.tsx` 两条既有 hooks warning。
- `npm.cmd run build`：通过。
- `npm.cmd run check:bundle`：通过，拼豆 page 为 `148.1 KiB < 220 KiB`，总产物为 `4589.7 KiB < 5 MiB`。
- `go test ./internal/service ./internal/httpapi -run 'Test(BeadProject|AppRouterMatchesBeadProjectSubtree)' -count=1`：通过。
- `git diff --check`：通过，仅显示既有 CRLF 工作区提示。
- Task-027 Playwright mock 浏览器脚本：通过，输出 `TASK_027_BROWSER_QA_PASS`。

## Browser Evidence

- `output/playwright/task-027-desktop.png`
- `output/playwright/task-027-mobile.png`
- `output/playwright/task-027-mobile-dark.png`

## Risks

- 验收使用受控 mock API；真实登录会话的对象存储、团队素材授权和跨设备同步仍需部署前人工抽测。
- Vite 独立环境中 mock 图片内容不是有效 PNG，截图中的加载失败文案只属于测试夹具，未写入工程 document。

## Contract Compliance

- 未改动 `internal/**`、素材库处理器、Task-025 schema/RBAC、计费、Sub2API、Docker、部署或生产配置。
- 未引入依赖、兼容层或客户端绕过校验；未提交、推送、部署或更新 Docker。

## Knowledge Candidates

- 无。并发保存与素材引用约束仍属于当前拼豆 Sprint 的项目内实现细节。
