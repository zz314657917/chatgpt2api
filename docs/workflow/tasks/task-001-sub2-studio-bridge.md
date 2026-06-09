---
task_id: task-001-sub2-studio-bridge
role: Developer Worker
repo: F:/mcplugins/sub2api
status: approved
---

# Task Contract

## Task ID
task-001-sub2-studio-bridge

## Role
你是 P/G/E 流程里的 Sub2API Developer Worker。只执行本 contract，不做架构裁决，不扩大范围。

## Goal
为 Sub2API 增加“外部创作站/落叶创艺”桥接能力：管理配置、登录回跳、内部余额/充值/使用记录查询、幂等扣费接口。

## Success Criteria
- Sub2API 管理侧可配置一个外部应用 `luoye-ai`：站点名、允许回跳域名、充值回跳 URL、默认聊天/生图/视频分组、内部通信密钥。
- 用户登录/注册完成后可跳转外部应用并携带一次性 `launch_token`；token 可过期、一次性兑换、签名或密钥错误会拒绝。
- 内部接口支持按 Sub2API 用户查询余额、充值 URL 和最近使用记录摘要。
- 内部接口支持 `reserve / commit / refund` 幂等扣费，同一 `charge_key` 不重复扣费，余额不足返回明确错误。
- 不修改支付核心回调逻辑。

## Context
- Repo: `F:/mcplugins/sub2api`
- Read first: `DEV_GUIDE.md`, `backend/internal/config/config.go`, `backend/internal/service/openwebui_launch_service.go`, `backend/internal/service/usage_billing.go`
- Related areas: auth handlers, setting/admin handlers, user/billing repositories, frontend admin settings.

## Allowed Paths
- `F:/mcplugins/sub2api/backend/internal/**`
- `F:/mcplugins/sub2api/backend/ent/schema/**`
- `F:/mcplugins/sub2api/frontend/src/**`
- `F:/mcplugins/sub2api/docs/**`
- `F:/mcplugins/sub2api/backend/cmd/server/**`
- `F:/mcplugins/sub2api/docs/workflow/worker-results/**`

## Denied Paths
- `F:/mcplugins/sub2api/.env*`
- `F:/mcplugins/sub2api/docker-compose*.yml`
- `F:/mcplugins/sub2api/knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- 支付平台回调核心逻辑，除非只暴露充值入口必要字段。

## Constraints
- 遵循 Sub2API 现有 Gin/Service/Repository/Ent 分层。
- 不写真实密钥，不提交生产域名。
- 不回滚或覆盖他人改动；你不是唯一 worker。
- 外部接口必须用内部密钥鉴权。

## Acceptance Commands
```powershell
cd F:/mcplugins/sub2api/backend
go test ./...
cd F:/mcplugins/sub2api/frontend
npm.cmd run build
```

## Output
- 写 worker report 到 `F:/mcplugins/sub2api/docs/workflow/worker-results/task-001-sub2-studio-bridge-result.md`。
- 第一行必须是 `### DONE: task-001-sub2-studio-bridge`、`### BLOCKED: task-001-sub2-studio-bridge` 或 `### FAILED: task-001-sub2-studio-bridge`。
- 列出 changed files、commands run、test output、risks、knowledge_candidates。

## Stop Rules
- 需要生产密钥、真实支付配置或破坏性数据库操作时停止。
- 需要大规模重写支付核心或用户体系时停止并报告。
- Contract 不清或验收命令不可执行时停止。

## Budget
- worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
