---
sprint: 1
status: approved
qa_mode: browser
last_verified: 2026-05-26
---

# Sprint 01 Contract

## Sprint 目标
- 稳定 `/canvas` 核心交互：图片引用去重、图片库输入、连线输入、生成状态、Output 回填和基础验收流程。

## 范围与非范围
- 范围：`/canvas` 前端智能画布、P/G/E 流程文档、图片引用和输入数据流。
- 非范围：后端接口、权限、数据库、对象存储、ComfyUI、RunningHub、视频生成、旧 React Flow 画布迁移。

## 输入/输出接口或命令面
- 不新增公开 API。
- 图片库拖拽、右栏“输入/画布”、本地图片拖拽/粘贴继续复用现有前端入口和 `/api/images/uploads`。
- 生成继续复用 `creation-tasks/image-generations` 和 `creation-tasks/image-edits`。

## 受影响模块
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `docs/workflow/**`

## 验收标准
- 右侧图片库和画布节点预览可用缩略图，但编辑和生成读取原图引用。
- 同一图片从 `path`、`url/local_url`、`thumbnail_url` 进入画布时会被识别为同一引用。
- 点击右侧图片库“输入”或拖图片到 API生成节点时，创建图片节点并连线到 API生成节点，不直接把重复图片塞进 API 节点。
- API生成节点展示输入图片时不会因上游连线和节点内旧 `input_images` 出现重复缩略图。
- 运行生成时会把遗留的直接 `input_images` 迁移成上游图片节点，并继续用原图提交图生图。
- 顶部导航、左侧功能栏、右侧图片库、运行记录和画布选择弹窗继续可用。

## 验证方式
- `cd web && npm.cmd run lint`
- `cd web && npm.cmd run build`
- `go test ./...`
- `git diff --check`
- 浏览器打开 `/canvas`，验证图片库输入、连线、节点显示、生成状态和浅色/深色视觉。
