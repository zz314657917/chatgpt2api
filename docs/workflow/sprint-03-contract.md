---
sprint: 3
task_id: canvas-sprint-003
role: generator
status: approved
qa_mode: browser
last_verified: 2026-05-27
---

# Sprint 03 Contract

## Goal
- 收敛 `/canvas` 的重复入口，接入 LLM 节点和撤销/重做时间轴。

## Success Criteria
- 左侧改为可收缩画布列表，支持切换、新建、刷新、重命名和二次确认删除。
- 顶部与右键菜单负责创建 `Prompt`、`LLM`、`API生成`、`Output`；右侧图片库不再显示画布列表。
- `LLM` 节点可读取上游 Prompt/图片/结果和节点内补充输入，复用 `creation-tasks/chat-completions` 输出文本。
- `API生成` 合并上游 Prompt 文本、LLM 输出文本和自身补充提示词。
- 接入内存历史栈，提供撤销/重做按钮、`Ctrl+Z` / `Ctrl+Y` 和最近操作列表。

## Allowed Paths
- `web/src/app/canvas/**`
- `web/src/lib/api.ts`
- `docs/workflow/**`
- `knowledge/tasks/current-task.md`
- `knowledge/tasks/timeline.md`

## Denied Paths
- `internal/**`
- 生产部署配置、数据库迁移、权限模型、对象存储实现。

## Acceptance Commands
- `cd web && npm.cmd run build`
- `cd web && npm.cmd run lint`
- `go test ./...`
- `git diff --check`

## Stop Rules
- 需要新增后端接口、数据库迁移或外部执行器时停止并重新起草 contract。
- 需要保存 API key、base_url、group_id 到画布节点时停止。
- 浏览器验收受登录态阻塞时，用命令验证和代码路径 review 记录残余风险。
