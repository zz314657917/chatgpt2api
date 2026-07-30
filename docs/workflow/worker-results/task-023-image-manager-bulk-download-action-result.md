### DONE: task-023-image-manager-bulk-download-action

## Changed Files

- `web/src/app/image-manager/page.tsx`
- Task-023 workflow artifacts.

## Result

- 素材库选中两张或以上图片时，右下角“操作”按钮左侧显示直接可见的“批量下载 (N)”按钮。
- 新按钮调用现有 `downloadItems("selected", selectedItems)`；个人、团队和公共图库继续使用原有 scope 与签名下载 URL，不新增 ZIP、后端导出或权限旁路。
- 弹层内的多选下载文案会在多选时同步显示为“批量下载 (N)”；单选仍显示“下载已选 (1)”。

## Verification

- `npm.cmd run lint`: PASS，0 warnings / 0 errors。
- `npm.cmd run build`: PASS，embedded frontend 已重新生成。
- `go test ./...`: PASS。
- `node output/playwright/task-023-image-manager-bulk-download-smoke.mjs`: PASS；两条当前 `scope=mine` 下载 URL 请求和两个浏览器下载均已确认。
- `git diff --check`: PASS，仅有既有 Windows LF/CRLF 提示。

## Risks

- 浏览器 smoke 使用受控素材和下载 URL 响应验证 UI 调度、scope 与下载动作；真实 CDN 签名 URL 的跨域和过期行为仍沿用既有单图下载链路，未在本轮生产环境复验。
