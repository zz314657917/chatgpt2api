---
sprint: 2
task_id: canvas-sprint-002
status: approved
qa_mode: browser
last_verified: 2026-05-27
---

# Sprint 02 Contract

## Sprint 目标
- 在 `/canvas` 左侧工具栏加入 Infinite Canvas 风格的 `细节增强`、`图片编辑`、`角度控制` 三个图片工具。
- 第一阶段只复刻交互和任务流，继续复用现有 `creation-tasks/image-edits`，不新增后端接口。

## 范围与非范围
- 范围：`/canvas` 前端工具入口、单图选中校验、角度控制参数面板、图片编辑器入口、编辑任务提交、轮询和结果节点回填。
- 范围：工具运行结果必须创建新节点，并从来源图片节点连线到结果节点，避免覆盖原图。
- 非范围：新增后端 API、第三方模型适配、API key 前端保存、权限/计费/对象存储模型调整、复制 Infinite Canvas 源码。

## 输入/输出接口或命令面
- 不新增公开 API。
- `细节增强` 和 `角度控制` 复用 `POST /api/creation-tasks/image-edits`。
- `图片编辑` 复用现有 `SmartCanvasImageEditor` 和图片上传/图片库保存链路。
- 角度控制参数在前端转换为 image edit prompt，并保存在结果节点的 `tool_parameters` 中。

## 受影响模块
- `web/src/app/canvas/page.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/types.ts`
- `docs/workflow/**`

## 验收标准
- 未选中图片或选中节点不满足“单张图片”时，三个图片工具置灰并给出 tooltip。
- 选中单张图片节点后，`细节增强` 可提交 image edit task，结果写入新 `result` 节点并从来源节点连线过去。
- `图片编辑` 可打开现有图片编辑器，应用裁剪、扩图、遮罩、画笔或宫格切分后生成相邻图片节点。
- `角度控制` 打开参数面板，包含 `水平角 0-360`、`垂直角 -30-90`、`缩放 0-10` 三个滑杆。
- `角度控制` 提交后通过 image edit task 生成新结果节点，结果节点保存 prompt、`tool_type` 和 `tool_parameters`。
- 失败任务只在结果节点上显示错误，不破坏来源图片节点和画布保存状态。

## 验证方式
- `cd web && npm.cmd run build`
- `cd web && npm.cmd run lint`
- `go test ./...`
- 浏览器打开 `/canvas`，验证左侧三工具禁用/启用、角度控制弹窗和图片编辑器打开路径。
