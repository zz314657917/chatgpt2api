### DONE: task-025-bead-project-cloud-storage

## Changed Files

- 新增 `internal/service/bead_project.go`、`internal/service/bead_project_test.go`。
- 新增 `internal/httpapi/bead_project.go`、`internal/httpapi/bead_project_test.go`，并接入 `App` 与 router。
- 更新权限、默认角色、分析路径及其测试。
- 更新 `web/src/lib/api.ts`、`web/src/lib/request.ts`，增加拼豆工程 API 类型、CRUD 和结构化 `HTTPError`。

## Commands Run

- `go test ./internal/service -run 'TestBeadProject|Test(DefaultPermission|Permission|Analytics)' -count=1`
- `go test ./internal/httpapi -run 'TestBeadProject|TestAppRouter|TestRBAC' -count=1`
- `go test ./internal/service ./internal/httpapi -count=1`
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"`
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"`
- `git diff --check`

## Key Results

- service/API 定向与包级测试通过；前端 lint 0 warnings/0 errors，生产构建通过。
- CRUD、重载、复制、30 项限制、owner 隔离、revision 409、5 MiB/尺寸/图层/格子/素材引用校验和索引失败补偿有自动测试。
- 列表只返回摘要与 24x24 以内真实格子预览；独立工程接口返回完整 v1 文档。
- `deepseek-v4-pro` worker 启动时被 Claude CLI 以模型 404 拒绝，未执行业务改动；主控 Codex 明确停止 worker loop 后在主工作树实现并验证。

## Risks

- 此 Sprint 只交付 service/API 契约，尚无 `/beads` 页面消费它。
- 未在真实 Postgres/MySQL 部署运行，但存储使用现有已支持嵌套名称的 `JSONDocumentBackend`，无数据库迁移。

## Contract Compliance

- 未修改拼豆页面、素材库、计费、Sub2API、Docker、部署或 `knowledge/**`。
- 未提交、推送或部署。

## Knowledge Candidates

- 无需提升；具体契约已在 `docs/workflow/spec.md` 和 task 文件中记录。
