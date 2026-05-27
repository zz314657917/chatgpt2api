---
task_id: canvas-sprint-001
role: Generator
status: approved
qa_mode: browser
last_verified: 2026-05-26
---

# Canvas Sprint 001

## Goal
稳定 `/canvas` 核心交互，重点处理图片引用去重、图片库输入、连线输入、生成状态和基础验收流程。

## Success Criteria
- 图片预览允许用缩略图；编辑、裁剪、生成和图生图提交使用原图引用。
- 图片库“输入”、拖拽到 API生成节点、粘贴到选中 API生成节点都会创建图片节点并连线，不直接制造重复 API 输入图。
- API生成节点聚合上游图片和历史直接输入时自动去重。
- 运行生成前会把遗留直接输入图迁移成图片节点，画布关系保持可见。
- P/G/E 文档记录当前 `/canvas` 开发边界、Agent Matrix、Sprint contract 和验收命令。

## Allowed Paths
- `web/src/app/canvas/**`
- `docs/workflow/**`

## Denied Paths
- `internal/**`
- `deploy/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`

## Acceptance Commands
```powershell
cd web
npm.cmd run lint
npm.cmd run build
cd ..
go test ./...
git diff --check
```

## Browser Acceptance
- 打开 `/canvas`，确认全局顶部导航、左侧功能栏、顶部节点工具条、右侧图片库、运行记录、画布选择弹窗可见。
- 从右侧图片库点击“输入”，应在画布生成图片节点并连到 API生成节点。
- 拖图片到 API生成节点，应在左侧生成图片节点并连线。
- API生成节点的 Images 区只展示去重后的输入图片。
- 点击图片打开编辑器时读取原图引用；节点预览可继续用缩略图。

## Stop Rules
- 需要新增或修改后端 API、权限、数据库、对象存储时停止并回 Planner。
- 需要引入 ComfyUI、RunningHub、GPU worker 或复制 Infinite-Canvas 代码时停止并回 Planner。
- 验收命令或浏览器环境不可用时记录 `BLOCKED`，不伪造 PASS。
