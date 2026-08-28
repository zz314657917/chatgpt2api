---
task_id: task-029-bead-conversion-controls
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-08-06
---

# Task 029: Bead Conversion Controls

## Task ID

task-029-bead-conversion-controls

## Role

Generator。为现有拼豆图片导入流程补充独立、可持久化的转换控制，不修改既有工程权限或素材存储边界。

## Goal

在拼豆工作台左侧导入面板新增精细度、抖动、平滑、主色聚类、最多色块、亮度和对比度控件；保留已有的最多色数数字输入。所有控制必须影响本地图片转换，自动保存后刷新仍可恢复。

## Success Criteria

- 左侧控件使用紧凑的标签与横向滑轨布局，提供可访问名称和稳定数值；最多色数继续支持滑轨和数字输入。
- 精细度、抖动、平滑、主色聚类、最多色块、亮度、对比度均进入转换算法，不能只是界面状态。
- 转换参数在 v1 工程文档中序列化、反序列化和服务端校验；既有未写入的新字段在前端以默认值恢复。
- 参数变化触发既有自动转换与自动保存链路，重置导入设置能恢复默认值。
- 现有 MARD 221/291 色数范围、图片转换和工程编辑不回退。

## Context

- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`, `web/src/app/beads/upstream/workbench-app.tsx`
- Related files: `web/src/app/beads/upstream/image-to-beads.ts`, `web/src/app/beads/project-adapter.ts`, `internal/service/bead_project.go`

## Allowed Paths

- `web/src/app/beads/**`
- `web/src/lib/api.ts`
- `internal/service/bead_project.go`
- `internal/service/bead_project_test.go`
- `docs/workflow/**`

## Denied Paths

- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- `deploy/**`, Docker 配置、Sub2API、计费、鉴权、素材库 API、数据库迁移。

## Constraints

- 独立实现参考产品的交互，不复制 AGPL 项目源码。
- 保持 `schema_version: 1`；工程文档不得存原图二进制或临时 URL。
- 参数范围必须在 UI、前端归一化、服务端校验与算法入口一致。
- 保持最小改动，不回滚或格式化既有脏改动。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run check:bundle"
go test ./internal/service ./internal/httpapi -count=1
go test ./...
git diff --check
```

## Browser QA Scenarios

- 打开工作台，确认导入面板全部控件可见、可操作且窄屏不横向溢出。
- 上传同一张本地图片，分别调整亮度、对比度、抖动与平滑，确认转换图案发生变化。
- 保存后刷新，确认转换控制值恢复；切换 221/291 后色数限制与数字输入同步。

## Output

- `docs/workflow/worker-results/task-029-bead-conversion-controls-result.md`
- `docs/workflow/qa-reports/task-029-bead-conversion-controls-qa.md`

## Stop Rules

- 如实现要求变更工程 schema、素材/鉴权 API、Docker 或生产配置，停止并回 Planner。
- 如算法参数无法在纯本地转换中产生可复现影响，停止并报告原因。
