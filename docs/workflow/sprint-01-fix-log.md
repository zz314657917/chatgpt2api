---
sprint: 1
status: ready-for-retest
last_verified: 2026-05-26
---

# Sprint 01 Fix Log

## 来源报告
- Sprint 1 contract：`docs/workflow/tasks/canvas-sprint-001.md`

## 已修复项
- 新增 P/G/E workflow 文档，并放开 `.gitignore` 中的 `docs/workflow/**`。
- 图片引用去重改为优先使用图片库 `path`，兼容 `url/local_url/thumbnail_url`。
- 图片库“输入”、拖拽到 API生成节点、选中 API生成节点后粘贴图片，统一创建或复用上游图片节点并连线。
- API生成节点展示和提交输入时使用同一套去重 key，避免同图重复缩略图。
- 运行生成前会把遗留直接 `input_images` 迁移为上游图片节点，生成提交继续读取原图。

## 仍待确认项
- 登录后浏览器交互验收尚未完成。
- 真实图生图任务提交、轮询和 Output 回填需要有效账号和模型额度验证。

## 重测准备
- 本地 8081 容器已更新到当前嵌入前端资源，健康检查 200。
- 进入有效登录态后，按 `docs/workflow/tasks/canvas-sprint-001.md` 的 Browser Acceptance 补测。
