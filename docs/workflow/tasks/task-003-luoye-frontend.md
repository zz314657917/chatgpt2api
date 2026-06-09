---
task_id: task-003-luoye-frontend
role: Developer Worker
repo: F:/java/chatgpt2api
status: approved
---

# Task Contract

## Task ID
task-003-luoye-frontend

## Role
你是 P/G/E 流程里的 chatgpt2api Frontend Developer Worker。只执行本 contract，不做架构裁决，不扩大范围。

## Goal
实现落叶AI普通用户前端：品牌、Sub2API 登录跳转、右上角余额/充值/用户菜单、隐藏 API 概念、团队模式 v1 轻界面。

## Success Criteria
- 品牌显示为“落叶AI”。
- 未登录访问用户页面时显示短暂跳转状态并跳 Sub2API 登录/注册。
- 右上角显示用户名、余额、充值按钮；下拉仅有个人资料、使用记录、退出登录。
- 普通用户 UI 不出现 API Key、Token、OpenAI-compatible、API 选择、限制 API 等面向开发者的文案。
- 保留 `创作台`、`无限画布`、`社媒运营`、`图片库` 四个入口。
- 团队 v1 轻界面支持创建团队、复制邀请码、加入团队、切换个人/团队空间、展示成员基础信息。

## Context
- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `web/src/components/top-nav.tsx`, `web/src/app/login/page.tsx`, `web/src/app/profile/page.tsx`, `web/src/lib/api.ts`

## Allowed Paths
- `web/src/**`
- `docs/workflow/worker-results/**`

## Denied Paths
- `internal/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- production deploy secrets or `.env*`.

## Constraints
- 遵循现有 React/Tailwind/shadcn 风格。
- 不改创作台核心生成逻辑。
- 不回滚或覆盖他人改动；你不是唯一 worker。
- UI 中避免出现用户不该理解的 API 概念。

## Acceptance Commands
```powershell
cd web
npm.cmd run lint
npm.cmd run build
```

## Output
- 写 worker report 到 `docs/workflow/worker-results/task-003-luoye-frontend-result.md`。
- 第一行必须是 `### DONE: task-003-luoye-frontend`、`### BLOCKED: task-003-luoye-frontend` 或 `### FAILED: task-003-luoye-frontend`。
- 列出 changed files、commands run、test output、risks、knowledge_candidates。

## Stop Rules
- 需要改后端接口实现时停止并说明需要 task-002 配合。
- 发现无法隐藏 API 文案且原因在后端响应时标记风险。

## Budget
- worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
