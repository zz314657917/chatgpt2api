---
phase: followup
current_sprint: asset-library-and-ecommerce-followup
total_sprints: 3
pending_action: production-verification-and-creative-workbench-followup
project_type: web
qa_mode: browser
approval_required: false
last_verified: 2026-06-13
---

# Workflow Status

- 当前阶段：`followup`
- 当前 Sprint：`asset-library-and-ecommerce-followup`
- 当前目标：在“落叶创艺独立用户版”已完成基础闭环后，继续收口素材库浏览器验收、`/canvas` 输出动作栈、`gpt-image-2` 结果序列化，以及新增 `ecommerce-suite` 电商套图工作台。
- 本轮范围：
  - 保持 Sub2API 外部创作站 bridge 与独立用户版主链稳定。
  - 验收素材库在 `/image-manager`、`/image`、`/canvas` 三处的一致工作流。
  - 收口 `/canvas` Output 动作栈与 `gpt-image-2` 任务结果序列化。
  - 增加 `ecommerce-suite` 普通用户工作台 v1。
- Task contracts：
  - `docs/workflow/tasks/task-001-sub2-studio-bridge.md`
  - `docs/workflow/tasks/task-002-luoye-backend.md`
  - `docs/workflow/tasks/task-003-luoye-frontend.md`
  - `docs/workflow/tasks/task-004-qa-browser.md`
  - `docs/workflow/tasks/task-006-ecommerce-suite-workbench.md`
- 后续补充证据：
  - `docs/workflow/qa-reports/task-007-asset-library-smoke-qa.md`
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
  - `/image-manager`、`/image`、`/canvas` 的素材库过滤、加入参考图/画布和 team/public 权限行为可用。
  - `ecommerce-suite` 在普通用户工作台中可见，未登录会先跳登录。
  - 团队空间入口与创建/加入/切换控件可见；团队 backend mutations 和团队任务记录闭环仍需真实账号 E2E 补验。
- 已完成开发 worker：
  - `task-001-sub2-studio-bridge`
  - `task-002-luoye-backend`
  - `task-003-luoye-frontend`
- 主控复核：
  - chatgpt2api bridge 已对齐 Sub2API `studio-bridge` 实际接口：`redeem`、`user-summary`、`charges/reserve|commit|refund`。
  - Sub2API 预扣确认使用原预扣金额，实际少消耗通过 refund 单独退回，避免幂等指纹冲突。
  - 顶部余额/充值入口优先读取 Sub2API 钱包摘要。
  - 2026-06-12 之后，素材库、`/canvas`、`gpt-image-2` 输出和 `ecommerce-suite` 仍在复用同一套登录/任务/资产底座，不应拆成独立系统理解。
- 已执行验证：
  - `F:/java/chatgpt2api`: `go test ./...`
  - `F:/java/chatgpt2api/web`: `npm.cmd run lint`
  - `F:/java/chatgpt2api/web`: `npm.cmd run build`
  - `F:/java/chatgpt2api`: `git diff --check`
  - `F:/mcplugins/sub2api/backend`: `go test ./...`
  - `F:/mcplugins/sub2api/frontend`: `npm.cmd run build`
  - `F:/mcplugins/sub2api`: `git diff --check`
  - `F:/java/chatgpt2api`: `go test ./internal/service ./internal/httpapi`
  - `F:/java/chatgpt2api`: `node docs/workflow/evidence/task-007-asset-library-smoke/browser-smoke.cjs`
- 当前 QA：
  - `task-004-qa-browser` 初版报告发现匿名 `/image` 验收失败。
  - 主控修复独立模式 Web 首屏守卫：匿名访问 `/image`、`/canvas`、`/social`、`/image-manager`、`/profile` 会先进入 `/login`，再由登录页跳 Sub2API。
  - 主控修复 Sub2API 钱包 `cny_milli` 单位透传和前端余额格式化，余额显示为 `¥123.45`。
  - 最终本地 mock bridge 浏览器 smoke 通过，证据位于 `docs/workflow/evidence/task-004-qa-browser/browser-smoke-result.json`。
  - QA contract 要求的报告已补到 `docs/workflow/qa-reports/task-004-qa-browser-qa.md`；该报告明确记录团队 backend mutations 未提交。
  - `task-007-asset-library-smoke` 已 PASS：浏览器证据确认 `/image-manager`、`/image`、`/canvas` 的素材集/未归类筛选、团队 manager/member 权限、public 只读和 `session-probe` 路径均符合预期。
  - 6/12 新增的 `fix(canvas): stack output image actions` 与 `fix(image): serialize gpt-image-2 creation task outputs` 已把 `/canvas` 输出图和图片结果格式推进到新的默认行为；知识与后续验收需要按这一行为理解。
  - `task-006-ecommerce-suite-workbench` 已立项并实现 v1，说明独立用户版主线已继续扩到新的创作工作台，而不是停留在 `/image` 与 `/canvas` 两页。
- 未验证项：
  - 真实 Sub2API 生产登录/注册、真实充值支付、真实扣费链路需要部署域名、密钥和支付配置后验证。
  - 团队创建/加入/切换 backend mutations 与团队任务记录闭环需要真实账号 E2E 补验。
  - Sub2API 扣费幂等当前是 Redis-backed 状态，不是生产级 SQL ledger；悬挂预扣恢复建议后续单独开 contract。
  - `ecommerce-suite` 的真实图片生成、汇总图下载和大样本运营素材生成仍主要停留在命令级验证与功能实现，尚未补完整浏览器 E2E 证据。
