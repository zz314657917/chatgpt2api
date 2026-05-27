---
sprint: 2
task_id: canvas-sprint-002
verdict: pass
qa_mode: browser
last_verified: 2026-05-27
---

# Sprint 02 QA

## Verdict
- PASS。

## Executed Checks
- `cd web && npm.cmd run build`：PASS。仅保留既有 npm config warning 与 Vite chunk size warning。
- `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- `go test ./...`：PASS。
- `git diff --check`：PASS，仅 Windows LF -> CRLF 工作区提示。

## Code Review Checks
- 左侧工具栏已加入 `细节增强`、`图片编辑`、`角度控制`。
- 三工具只读取 `image` 节点图片与 `result` 节点输出图片；未选中、无图片或多图时禁用并显示 tooltip。
- `细节增强` 与 `角度控制` 走 `createImageEditTask`，结果写入新的 `result` 节点，并从来源节点创建连线。
- `角度控制` 弹窗包含水平角、垂直角、缩放三个滑杆，并把归一化参数保存到 `tool_parameters`。
- `图片编辑` 复用 `SmartCanvasImageEditor`，应用后上传图片库并创建相邻图片节点，节点保存 `source_images`、`tool_type=image_edit` 和工具参数，并连回来源节点。
- 工具产物可见性跟随来源节点，避免任务提交和节点数据不一致。

## Browser Note
- 本轮尝试用临时 smoke 后端验证 `/canvas`，但登录页只暴露 leaf network 登录按钮，不提供本地账号表单；in-app browser 页面上下文也无法完成 session 注入。
- 因此本轮浏览器点选级验收未作为 PASS 证据，PASS 依据为构建、lint、后端测试和代码路径 review。真实登录态下仍建议人工打开 `/canvas` 做一次点击确认。

## Residual Risks
- `细节增强` 和 `角度控制` 第一阶段仍是 prompt 化 image edit，不保证模型严格按专用 upscale 或多角度参数执行。
- Worker 产出的撤销/重做、错误详情、图库筛选模块已通过构建，但尚未接入 `/canvas` UI，归入后续 Sprint。
