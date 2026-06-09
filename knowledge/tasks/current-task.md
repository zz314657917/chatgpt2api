# Current Task

最后更新：2026-06-10 02:38 +08:00

## 背景

`chatgpt2api` 最近主线已从 `/canvas` 与图片任务稳定性，前移到“落叶创艺独立用户版”。本仓库已完成提交 `47c9f72 feat: add luoye independent studio mode`，定位改为面向普通用户的独立创作站：用户注册/登录、充值和余额真源统一走 Sub2API，站内直接进入创作，不再要求用户理解 API Key、Token、OpenAI-compatible 或 API 选择。

Sub2API 对应桥接提交为 `fe2f80be1 feat: add studio bridge integration`。两边本地容器已重建并健康运行，当前默认续做入口是生产配置与真实闭环验证。

## 当前主线

- 生产部署前配置正式 Sub2API bridge URL、internal secret、recharge URL、默认聊天/生图/视频分组和落叶创艺回跳域名。
- 用真实账号跑完整链路：Sub2API 注册/登录 -> 回跳落叶创艺 -> 充值 -> 创作扣费 -> 使用记录 -> 团队空间。
- 团队模式 v1 的后续验证重点是团队空间任务记录 `team_id`、`payer_user_id`、`actor_user_id`，以及扣队长/团队额度的真实生产链路。
- UI 继续维持独立用户版语义：顶部为用户名下拉，充值入口在下拉或余额 hover 逻辑里，普通用户不暴露本地管理员、API 绑定、限制 API、API Key、Token、OpenAI-compatible 等入口。

## 已稳定事实

- Sub2API 是用户、余额、充值、管理配置和扣费的唯一真源；落叶创艺只保存必要用户映射和创作站会话。
- 未登录访问落叶创艺用户页时走 Sub2API launch/redeem 链路，`launch_token` 只用于一次性换取本地 session。
- 创作任务通过 Sub2API 默认分组和钱包适配器执行，任务前预扣，成功确认，失败或取消退款。
- 扣费安全复核已补齐：独立模式下 Sub2API 普通用户不能调用 `/v1/messages` 绕过创作任务；社媒文案生成和 Canvas 提示词节点已纳入 chat 创作扣费；Sub2API 桥端余额不足会映射为统一的 `BillingLimitError` / HTTP 429。
- Sub2API 外部扣费金额单位为 `cny_milli`，落叶侧发送到 Sub2API 时换算为元，例如 `51 -> 0.051`。
- 团队模式 v1 只做“团队共享额度”可用闭环，产品文案不说“调用队长 API”。
- `.codex-runtime/` 是本地重包目录，已加入 ignore，不应进入提交。
- 2026-06-10 本地验收确认：Sub2API launch/redeem 能进入落叶创艺 `/image`，页面和账号菜单不暴露 API Key、Token、OpenAI-compatible、API 选择、限制 API 或 `sub2api:` 内部标识；团队页可创建团队并切换到 team scope。
- 2026-06-10 本地扣费验收确认：Sub2API Studio Bridge `reserve / commit / refund` 使用 `(app_id, charge_key)` 幂等；重复 reserve/commit/refund 不重复扣退；commit 后 refund 被拒绝；同 charge_key 改金额被拒绝；余额不足返回明确错误；普通用户直打协议 API 被独立模式 403 拦截。

## 下一步

- 上线前先整理生产部署清单，确认两个站点域名、回跳 URL、充值 URL、内部密钥、默认分组和对象存储地域。
- 使用真实账号做浏览器 E2E：注册、登录回跳、充值、创作成功/失败扣费、使用记录、团队创建/加入/团队扣费。
- 如继续开发，优先补生产联调脚本和 Playwright 最小闭环，而不是继续扩展新功能。
- 生产环境仍需人工确认真实支付回调、真实上游创作扣费、网络超时/DB 故障注入和迁移演练；本地验收不触碰真钱支付，也不消耗真实上游模型。

## 证据入口

- `chatgpt2api` 提交：`47c9f72 feat: add luoye independent studio mode`
- Sub2API 提交：`fe2f80be1 feat: add studio bridge integration`
- `chatgpt2api` 验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint`
  - `cd F:/java/chatgpt2api/web && npm.cmd run build`
  - `cd F:/java/chatgpt2api && go test ./...`
  - `cd F:/java/chatgpt2api && go test ./internal/httpapi -run "TestLuoyeIndependent(SocialCopy|CanvasPrompt|ChatAuto)|TestLuoyeIndependentSub2APIDefaultGroupAndBilling|TestLuoyeIndependentModeDisablesMessagesForSub2APIUsers" -count=1`
- Sub2API 验证：
  - `cd F:/mcplugins/sub2api/frontend && npm.cmd run test:run -- public-smoke`
  - `cd F:/mcplugins/sub2api/frontend && npm.cmd run build`
  - `cd F:/mcplugins/sub2api/backend && go test ./...`
  - `cd F:/mcplugins/sub2api/backend && go test -tags=integration ./internal/repository -run "TestStudioBridgeRepository" -count=1`
- 其他验证：两边 `git diff --check` 通过；本地 `chatgpt2api:local` 和 `sub2api:local` 容器健康，`/studio-bridge/launch` 不再 404。
- 2026-06-10 02:38 本地复核：
  - `docker ps` 显示 `chatgpt2api`、`sub2api` healthy；`http://127.0.0.1:8081/health` 返回 ok；`http://127.0.0.1:62080/` 返回 200。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/mcplugins/sub2api/backend && go test ./...` 通过。
  - `cd F:/mcplugins/sub2api/frontend && npm.cmd run test:run -- public-smoke` 通过。
  - `cd F:/mcplugins/sub2api/frontend && npm.cmd run build` 通过，仅有既有 Vite chunk、Browserslist 和 Node deprecation 警告。
  - `git diff --check` 两仓库均无 whitespace 错误，仅 LF/CRLF 工作区提示。
  - 浏览器截图证据：`output/playwright/luoye-image-after-launch.png`、`output/playwright/luoye-account-menu.png`、`output/playwright/luoye-team-page.png`、`output/playwright/luoye-profile-page.png`。
