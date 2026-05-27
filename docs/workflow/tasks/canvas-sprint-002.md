---
task_id: canvas-sprint-002
role: generator
status: approved
qa_mode: browser
last_verified: 2026-05-27
---

# Canvas Sprint 002

## Goal
- 将 Infinite Canvas 参考图中的 `细节增强`、`图片编辑`、`角度控制` 三个工具迁移到本仓库 `/canvas`。

## Success Criteria
- 左侧工具栏包含三项图片工具。
- 三项工具只在当前选中节点包含单张图片时可用。
- `细节增强` 与 `角度控制` 复用现有 image edit task 链路，并创建新结果节点。
- `图片编辑` 复用现有画布图片编辑器，并把本地编辑结果作为新图片节点加入画布。
- 不新增后端接口，不保存第三方 API key，不复制 Infinite Canvas 源码。

## Allowed Paths
- `web/src/app/canvas/**`
- `docs/workflow/**`
- `knowledge/tasks/current-task.md`
- `knowledge/tasks/timeline.md`

## Denied Paths
- `internal/**`
- `web/src/lib/api.ts`
- 生产部署配置、数据库迁移、权限模型、对象存储实现。

## Acceptance Commands
- `cd web && npm.cmd run build`
- `cd web && npm.cmd run lint`
- `go test ./...`

## Output
- 代码变更、workflow 记录和验证结论。

## Stop Rules
- 需要新增后端接口或第三方模型适配时停止并重新起草 contract。
- 发现现有图片编辑器无法复用时停止并说明替代方案。
- 测试环境需要生产密钥或真实外部任务才能通过时，只做无密钥 UI smoke 并记录未验证风险。
