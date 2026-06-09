---
phase: done
current_sprint: luoye-ai-independent-user-edition
total_sprints: 1
pending_action: production-deployment-verification
project_type: web
qa_mode: browser
approval_required: false
last_verified: 2026-06-09
---

# Workflow Status

- 当前阶段：`done`
- 当前 Sprint：`luoye-ai-independent-user-edition`
- 当前目标：把 `chatgpt2api` 改造成“落叶AI”独立用户版，普通用户只走 Sub2API 注册、登录、充值和扣费，站内直接创作；同时实现团队共享额度 v1。
- 本轮范围：
  - Sub2API 外部创作站 bridge。
  - chatgpt2api 落叶AI独立模式后端。
  - chatgpt2api 落叶AI普通用户前端。
  - 跨仓库浏览器验收。
- Task contracts：
  - `docs/workflow/tasks/task-001-sub2-studio-bridge.md`
  - `docs/workflow/tasks/task-002-luoye-backend.md`
  - `docs/workflow/tasks/task-003-luoye-frontend.md`
  - `docs/workflow/tasks/task-004-qa-browser.md`
- 验证命令：
  - `cd web && npm.cmd run lint`
  - `cd web && npm.cmd run build`
  - `go test ./...`
  - Sub2API 按仓库现有 backend/frontend 测试脚本执行。
- 浏览器验收：
  - 未登录访问 `/image` 或 `/canvas` 跳 Sub2API。
  - 登录回跳后进入创作台。
  - 右上角余额和充值入口可见。
  - 普通用户 UI 不出现 API Key、Token、OpenAI-compatible、API 选择。
  - 团队创建、加入、切换和团队任务记录可用。
- 已完成开发 worker：
  - `task-001-sub2-studio-bridge`
  - `task-002-luoye-backend`
  - `task-003-luoye-frontend`
- 主控复核：
  - chatgpt2api bridge 已对齐 Sub2API `studio-bridge` 实际接口：`redeem`、`user-summary`、`charges/reserve|commit|refund`。
  - Sub2API 预扣确认使用原预扣金额，实际少消耗通过 refund 单独退回，避免幂等指纹冲突。
  - 顶部余额/充值入口优先读取 Sub2API 钱包摘要。
- 已执行验证：
  - `F:/java/chatgpt2api`: `go test ./...`
  - `F:/java/chatgpt2api/web`: `npm.cmd run lint`
  - `F:/java/chatgpt2api/web`: `npm.cmd run build`
  - `F:/java/chatgpt2api`: `git diff --check`
  - `F:/mcplugins/sub2api/backend`: `go test ./...`
  - `F:/mcplugins/sub2api/frontend`: `npm.cmd run build`
  - `F:/mcplugins/sub2api`: `git diff --check`
- 当前 QA：
  - `task-004-qa-browser` 初版报告发现匿名 `/image` 验收失败。
  - 主控修复独立模式 Web 首屏守卫：匿名访问 `/image`、`/canvas`、`/social`、`/image-manager`、`/profile` 会先进入 `/login`，再由登录页跳 Sub2API。
  - 主控修复 Sub2API 钱包 `cny_milli` 单位透传和前端余额格式化，余额显示为 `¥123.45`。
  - 最终本地 mock bridge 浏览器 smoke 通过，证据位于 `docs/workflow/evidence/task-004-qa-browser/browser-smoke-result.json`。
- 未验证项：
  - 真实 Sub2API 生产登录/注册、真实充值支付、真实扣费链路需要部署域名、密钥和支付配置后验证。
  - Sub2API 扣费幂等当前是 Redis-backed 状态，不是生产级 SQL ledger；悬挂预扣恢复建议后续单独开 contract。
