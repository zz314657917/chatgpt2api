### DONE: task-026-bead-workbench-port

## Changed Files

- 新增 `web/src/app/beads/**`：原生模块化拼豆工作台、MARD 色卡、画布、编辑器、3D 预览、统计、导出器与工程适配器。
- 更新路由、动画路由、顶部导航、前端 API、Vite 分包和 bundle 预算；新增 `THIRD_PARTY_NOTICES.md`。
- 新增工作台和工程列表的 CSS namespace，并修复工作区高度与项目缩略图响应式网格。

## Commands Run

- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"`
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"`
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run check:bundle"`
- `go test ./internal/service ./internal/httpapi -run 'Test(BeadProject|AnalyticsServiceRecognizesBeadWorkbench|AppRouterMatchesBeadProjectSubtree)' -count=1`
- `git diff --check`

## Key Results

- `/beads` 工程列表与 `/beads/:projectId` 工作台已接入 Task-025 API；导航位于“电商套图”和“素材库”之间。
- 已迁入图片转拼豆、MARD 221/291、编辑工具、多图层、参考图、3D、用量统计及 PNG/PDF/XLSX/JSON 导出。
- 工程转换参数、色卡和参考图设置可通过工程 document 保存恢复；JSON 导入始终创建新工程。
- Three.js 和导出器保持懒加载，`vendor-three` 独立分块；拼豆页面 chunk 为 133.3 KiB，总产物为 4568.0 KiB，均在预算内。
- 浏览器 QA 已通过，证据见 `docs/workflow/qa-reports/task-026-bead-workbench-port-qa.md`。

## Risks

- `go test ./internal/service ./internal/httpapi -count=1` 的全包运行由既有 `TestLuoyeIndependentSub2APIDefaultGroupAndBilling` 失败中断（仅出现 `reserve`，期望 `reserve/commit`）；拼豆定向 service/httpapi 测试通过，未修改该无关计费链路。
- 深色主题需在支持项目 `oklch` 变量的目标浏览器或部署构建中复核；当前 Vite mock 页面只有公共非拼豆接口的连接错误。

## Contract Compliance

- 固定上游 commit 原生进入当前 Vite module graph，未使用 iframe、上游构建物、脚本、README 或截图。
- 未修改 Task-025 后端契约、素材库 API、计费、Sub2API、Docker、部署或 `knowledge/**`。
- 未提交、推送、部署或更新 Docker。
