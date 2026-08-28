---
task_id: task-025-bead-project-cloud-storage
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-08-05
---

# Task 025: Bead Project Cloud Storage

## Task ID

task-025-bead-project-cloud-storage

## Role

你是 P/G/E 流程里的 Generator worker。只执行本 contract，不做架构裁决，不扩大范围。

## Goal

为拼豆工坊建立个人私有、基于现有 JSON 文档后端的云端工程存储和完整 REST API，并补齐菜单/API 权限、默认普通用户授权、分析路径和前端类型化客户端。此 Sprint 不实现拼豆页面或工作台。

## Success Criteria

- `GET/POST /api/bead-projects`、`GET/PUT/PATCH/DELETE /api/bead-projects/{id}` 与 `POST /api/bead-projects/{id}/copies` 按计划工作；列表只返回轻量摘要，单项接口返回完整 v1 文档。
- 服务端从登录身份计算 owner；跨用户访问、复制、修改和删除统一表现为 404，客户端无法写入 owner。
- `revision` 从 1 开始，保存、重命名均要求匹配；冲突返回 HTTP 409 和云端最新 revision。
- 每用户最多 30 个工程；名称最多 80 字；画布边长 1..156；最多 20 图层；组合格子和各图层格子数量严格等于宽乘高；请求/工程 JSON 最大 5 MiB。
- `schema_version` 仅接受 1；工程包含画布、组合格子、图层、活动图层、MARD 色卡版本、编辑设置、豆板设置、转换参数和素材引用；不持久化撤销栈。
- 素材引用只接受 `{path,name,scope:"mine"|"team",team_id?}`；拒绝 `data:`、`blob:`、HTTP(S) URL、图片二进制和临时签名 URL。
- 使用 `bead-projects/<owner-hash>/index.json` 与 `bead-projects/<owner-hash>/<project-id>.json`；索引只保存摘要。写入失败不留下仅存在于内存或索引/文档一侧的半成品状态。
- JSON 导入所需的带 v1 内容 POST 始终创建新 ID；复制创建独立副本且 revision 重置为 1；删除工程不触碰素材图片。
- RBAC 增加 `/beads` 菜单权限及 `GET/POST/PUT/PATCH/DELETE /api/bead-projects` 权限，默认普通用户拥有，自定义角色不被自动扩权；分析目录新增 `/beads = 拼豆工坊`。
- 前端 `HTTPError` 暴露 `status` 与结构化响应 data，并提供 bead-project API 类型和 CRUD 方法，能读取 409 的最新 revision。

## Context

- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`, `internal/service/permissions.go`, `internal/storage/storage.go`, `internal/httpapi/app.go`, `internal/httpapi/router.go`, `web/src/lib/api.ts`, `web/src/lib/request.ts`
- Storage layout: `bead-projects/<owner-hash>/index.json` and `bead-projects/<owner-hash>/<project-id>.json`

## Allowed Paths

- `internal/service/bead_project.go`
- `internal/service/bead_project_test.go`
- `internal/service/permissions.go`
- `internal/service/permissions_test.go`
- `internal/service/auth_test.go`
- `internal/service/analytics.go`
- `internal/service/analytics_test.go`
- `internal/httpapi/bead_project.go`
- `internal/httpapi/bead_project_test.go`
- `internal/httpapi/app.go`
- `internal/httpapi/router.go`
- `internal/httpapi/router_test.go`
- `web/src/lib/api.ts`
- `web/src/lib/request.ts`
- `web/src/lib/api.assert.ts`
- `docs/workflow/**`

## Denied Paths

- `web/src/app/**`、导航组件、拼豆算法/画布/色卡/导出器、Three.js、素材库 UI 和移动端布局。
- 数据库 schema/migration、对象存储协议、图片上传 API、Sub2API、计费、AI 生成、Docker、部署和生产配置。
- `knowledge/**`、`C:/Users/Administrator/.codex/memories/**` 与未列入 Allowed Paths 的文件。

## Constraints

- 不新增数据库表或迁移；仅使用当前 `storage.JSONDocumentBackend`。
- owner hash 使用稳定的登录身份 owner 计算，不在公开响应或文档路径暴露原始 owner。
- 错误使用可判别的 service error 类型或 sentinel，HTTP 层稳定映射 400/404/409/413/500。
- 所有服务方法返回克隆值，不能把内部 map/slice 暴露给调用方。
- 写入采用锁内快照与补偿回滚；保存失败必须恢复内存，并尽力恢复此前成功写入的文档/索引。
- 不添加兼容层、feature flag 或旧 schema fallback；当前 API 只支持 v1。
- 保留工作树现有用户改动，不格式化无关文件。

## Acceptance Commands

```powershell
go test ./internal/service -run 'TestBeadProject|Test(DefaultPermission|Permission|Analytics)' -count=1
go test ./internal/httpapi -run 'TestBeadProject|TestAppRouter|TestRBAC' -count=1
go test ./internal/service ./internal/httpapi -count=1
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
git diff --check
```

## Output

- `docs/workflow/worker-results/task-025-bead-project-cloud-storage-result.md`
- 必须列出 changed files、commands run、关键 test output、risks、contract compliance 和 knowledge_candidates。
- 第一行必须是 `### DONE: task-025-bead-project-cloud-storage`、`### BLOCKED: task-025-bead-project-cloud-storage` 或 `### FAILED: task-025-bead-project-cloud-storage`。

## Stop Rules

- 如嵌套 JSON 文档名称不受现有存储后端支持，或必须改数据库 schema/对象存储接口，停止并回 Planner。
- 如 owner 身份无法从现有 `service.Identity` 稳定推导，停止并请求 Codex 裁决。
- 如 API 错误结构必须全局破坏性变更而无法保持现有调用兼容，停止并报告 blocked。
- 如需要修改拼豆页面、上游迁移文件、图片 API、计费或部署，停止，不得扩大范围。

## Budget

- worker_mode: `claude-bare-deepseek-v4-pro`
- qa_worker_mode: `claude-bare-deepseek-v4-pro`
- worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
