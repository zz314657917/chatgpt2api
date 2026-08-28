### PASS: task-026-bead-workbench-port

# Task-026 拼豆工作台浏览器验收

日期：2026-08-05
环境：Vite `http://127.0.0.1:5175`，Playwright CLI 独立 session `beads-task026-browserqa`，视口 `1440x900`

## Findings

- 首次验收发现右侧 291 色板撑高 `.workspace/.canvas` 至 `3907px`，导致豆板不在首屏且指针无法绘制；主控增加工作区高度/overflow 约束后复测通过（Canvas `655x756`，画板可见可绘制）。
- 首次列表验收发现 Tailwind 响应式 grid 未命中，缩略图被放大至 `1367x939.8px`；主控改为 `.beads-project-grid` 媒体查询与 16:11 预览后复测通过（1440px 下 3 列，卡片约 `455x378px`）。

## Executed Checks

- `/beads` 新建并打开 `/beads/beads-qa-1`；工程列表真实缩略图存在，缩略 canvas 像素颜色数分别为 29/18。
- 画笔实际拖拽生成 5 颗；撤销恢复 0 颗，重做恢复 5 颗；新建图层并绘制后为 2 图层、6 颗。
- MARD 291 -> 221 切换，显式保存显示“已保存”，刷新后仍为 `basic` 且保留 5 颗；再切回 `complete` 保存。
- 3D 预览截图非空：`task026-3d-before.png`（11873 bytes）与旋转后 `task026-3d-after.png`（11870 bytes）图案位置改变；工作台截图 `task026-browserqa-drawn.png`。
- 上传本地 PNG `task026-export.png` 后转换为 `52 * 74 - 6 色 - 3853 颗`，参考图状态显示“已选择”。
- PNG 下载：`output/playwright/task026-export-layer1.png`、`task026-export-layer2.png`，各 112063 bytes，头部 `89 50 4E 47`。
- PDF 下载：`output/playwright/task026-export-layer1.pdf`、`task026-export-layer2.pdf`，各 151779 bytes，头部 `%PDF-1.4`。
- Excel 用量下载：`output/playwright/task026-usage.xlsx`，10054 bytes，头部 `PK 03 04`。
- JSON 编辑记录下载：`output/playwright/task026-edit.json`，104381 bytes，可解析且含 52 宽度、2 图层；导入后新建 `/beads/beads-qa-2`，未覆盖原工程。
- 列表重命名为 `QA Imported`、创建副本后工程数从 2 增至 3、删除副本后回到 2；证据 `task026-browserqa-project-list-fixed.png`。
- 1440x900 页面 `scrollWidth=1423 <= clientWidth=1440`，无横向溢出；工作台证据 `task026-browserqa-workbench-fixed.png`。

## Unverified Risks

- 当前浏览器运行时 `CSS.supports('color', 'oklch(...)')` 为 false，直接切换 `html.dark` 时深色变量会回落为透明/黑字；真实产品主题切换需在支持项目主题变量的目标浏览器或部署构建中复核。本次 PASS 依据浅色工作台与列表实际交互。
- 控制台中的 `/api/canvases`、公告和 app-meta `ERR_CONNECTION_REFUSED` 来自 Vite 独立 mock 未覆盖的现有公共请求，不影响拼豆 mock API；3D `ReadPixels` 采样曾触发测试侧 WebGL context 警告，视觉截图确认 3D 非空与旋转。

## Recommendation

Task-026 浏览器场景已 PASS，可进入 Task-027；进入下一阶段前建议在真实主题运行时补一次深色视口验收，并在 QA 脚本中避免对 Three.js canvas 创建不同类型的 context。
