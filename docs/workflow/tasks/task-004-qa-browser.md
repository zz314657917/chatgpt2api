---
task_id: task-004-qa-browser
role: QA Worker
repo: F:/java/chatgpt2api
status: approved-after-build
---

# Task Contract

## Task ID
task-004-qa-browser

## Role
你是 P/G/E 流程里的 QA Worker。只在开发 worker 完成并经主控允许后执行验收，不修改业务代码。

## Goal
对落叶AI独立用户版做跨仓库命令验证和浏览器验收，确认登录回跳、充值、余额、隐藏 API 文案、创作扣费和团队 v1 最小闭环。

## Success Criteria
- chatgpt2api 通过 lint、frontend build、Go tests。
- Sub2API 通过仓库现有 backend/frontend 最小验证命令。
- 浏览器验收能覆盖未登录跳转、登录回跳、余额/充值入口、普通用户无 API 文案、团队创建/加入/切换。
- 输出 PASS/FAIL/BLOCKED 首行和证据路径。

## Context
- Repo: `F:/java/chatgpt2api`
- Cross repo: `F:/mcplugins/sub2api`
- Read first: `docs/workflow/spec.md`, 本轮三个 worker result。

## Allowed Paths
- `docs/workflow/qa-reports/**`
- screenshot/log artifacts under workflow evidence folders.

## Denied Paths
- `internal/**`
- `web/src/**`
- `F:/mcplugins/sub2api/backend/**`
- `F:/mcplugins/sub2api/frontend/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`

## Constraints
- 不修改业务代码。
- 不把 worker 自述当 PASS 证据，必须有命令、截图、日志或明确人工检查。

## Acceptance Commands
```powershell
cd F:/java/chatgpt2api/web
npm.cmd run lint
npm.cmd run build
cd F:/java/chatgpt2api
go test ./...
```

## Output
- 写 QA report 到 `docs/workflow/qa-reports/task-004-qa-browser-qa.md`。
- 第一行必须是 `### PASS: task-004-qa-browser`、`### FAIL: task-004-qa-browser` 或 `### BLOCKED: task-004-qa-browser`。

## Stop Rules
- 开发 worker result 缺失或首行 verdict 不合法时停止。
- 测试环境无法启动或缺少关键配置时报告 BLOCKED。

## Budget
- qa_worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
