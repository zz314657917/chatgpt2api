---
task_id: task-002-luoye-backend
role: Developer Worker
repo: F:/java/chatgpt2api
status: approved
---

# Task Contract

## Task ID
task-002-luoye-backend

## Role
你是 P/G/E 流程里的 chatgpt2api Backend Developer Worker。只执行本 contract，不做架构裁决，不扩大范围。

## Goal
实现落叶创艺独立模式后端：Sub2API launch token 登录、本地会话映射、Sub2API 余额/扣费适配、系统默认分组调用、团队模式 v1 后端。

## Success Criteria
- 普通用户只通过 Sub2API launch token 建立会话；本地普通用户注册/登录/API 绑定路径在独立模式下不可见或不可用。
- 任务执行统一使用系统配置的 Sub2API 默认聊天/生图/视频分组，不要求用户绑定 API Key。
- 创作任务前调用 Sub2API `reserve`，成功后 `commit`，失败/取消时 `refund`；扣费 key 幂等。
- 团队 v1 后端支持创建团队、创建者定向邀请、撤销邀请、移除成员、调整角色、切换/查询当前空间。
- 团队空间任务记录 `team_id`、`payer_user_id`、`actor_user_id`，扣费 payer 为队长/团队共享额度。

## Context
- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `internal/httpapi/app.go`, `internal/httpapi/routes.go`, `internal/service/sub2api_launch.go`, `internal/service/billing.go`

## Allowed Paths
- `internal/config/**`
- `internal/httpapi/**`
- `internal/service/**`
- `internal/storage/**`
- `internal/protocol/**`
- `docs/workflow/worker-results/**`
- backend tests beside changed Go files.

## Denied Paths
- `web/src/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- production deploy secrets or `.env*`.

## Constraints
- 保持现有 Go 分层：HTTP 只做校验/调度，业务逻辑下沉 service。
- 不删除旧管理员能力，只在独立模式中隐藏/限制普通入口。
- 不回滚或覆盖他人改动；你不是唯一 worker。
- 不引入兼容层；按当前目标 API 实现。

## Acceptance Commands
```powershell
go test ./...
git diff --check
```

## Output
- 写 worker report 到 `docs/workflow/worker-results/task-002-luoye-backend-result.md`。
- 第一行必须是 `### DONE: task-002-luoye-backend`、`### BLOCKED: task-002-luoye-backend` 或 `### FAILED: task-002-luoye-backend`。
- 列出 changed files、commands run、test output、risks、knowledge_candidates。

## Stop Rules
- 需要改 `web/src/**`、生产配置或删除旧后台时停止。
- 需要依赖 Sub2API 未实现接口且无法用测试 stub 验证时标记风险或 blocked。

## Budget
- worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
