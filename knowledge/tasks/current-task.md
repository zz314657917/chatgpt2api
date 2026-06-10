# Current Task

最后更新：2026-06-10 18:21 +08:00

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
- 2026-06-10 对话价格显示 `¥0.00` 的原因已确认：Sub2API 扣费记录正常写入 `0.001` 元，落叶创艺团队页按两位小数展示 `cny_milli` 导致 `1 -> ¥0.00`；已改为千分元最多 3 位小数展示，并让运行中任务可展示 `billing_charged_amount` 预扣金额。
- 2026-06-10 独立站体验收口：团队成员可主动退出团队，团队使用记录可显示运行中预扣金额，创作台图片库支持个人/团队/公共分组，图片库页面布局改为稳定高度容器以减少加载/空状态跳动。
- 2026-06-10 登录态同步修复：落叶创艺顶栏通过隐藏 iframe 探测 Sub2API 当前浏览器登录态，Sub2 未登录或切到不同用户时会调用落叶本地 `/auth/logout` 清 HttpOnly cookie，再清前端缓存并跳 `/login`；同用户时强制刷新 `/auth/session` 和钱包，避免余额/账号信息停留在旧缓存。
- 2026-06-10 Sub2API 探针安全修复：新增 `/studio-bridge/session-probe` 页面和用户接口，只返回当前 Sub2 用户 ID；后端校验 `parent_origin` 必须命中落叶配置的 `launch_return_url` 同源或 `allowed_return_domains`，并且只对该探针路径动态放开 CSP `frame-ancestors`，其它页面仍保持禁止嵌入。
- 2026-06-10 会话响应修复：落叶 `/auth/session` 对 Sub2 用户会带回保存的 `sub2api` binding，至少包含 `sub2api_user_id`，前端也能从 `subject_id=sub2api:<id>` fallback 推出探针目标，避免刷新后探针组件不渲染。
- 2026-06-10 浏览器验收确认：Sub2 登录后 launch 到落叶 `/image`，探针 iframe 存在且源为 `http://127.0.0.1:62080/studio-bridge/session-probe`；清空 Sub2 登录态后访问落叶会自动跳 `/login`，随后 `/auth/session` 返回 401，再访问 `/image` 仍停在 `/login`，不会继续读旧账号。
- 2026-06-10 对象存储安全收口：图片展示和生成结果统一返回站内 `/images/...`，不再向前端暴露对象存储 `object_key/object_url/storage_backend`；用户下载图片时通过 `/api/images/download-url` 鉴权后获取短期 presigned `GetObject` URL，适配私有读写 bucket，下载流量可直连国内对象存储/CDN。
- 2026-06-10 腾讯云 CDN URL 鉴权补齐：当配置 `CHATGPT2API_IMAGE_OBJECT_STORAGE_PUBLIC_BASE_URL` 和 `CHATGPT2API_IMAGE_OBJECT_STORAGE_CDN_AUTH_KEY` 时，图片下载链接改为腾讯云 CDN TypeA `sign=timestamp-rand-uid-md5hash` 临时 URL；`expires_at` 跟 `CHATGPT2API_IMAGE_OBJECT_STORAGE_CDN_AUTH_TTL_SECONDS` 对齐，默认 1800 秒。

## 下一步

- 上线前先整理生产部署清单，确认两个站点域名、回跳 URL、充值 URL、内部密钥、默认分组、对象存储地域和 bucket 私有读写策略。
- 对象存储生产配置建议改为私有读写：`CHATGPT2API_IMAGE_OBJECT_STORAGE_ACL=private` 或留空使用 bucket 默认私有；如配置 `CHATGPT2API_IMAGE_OBJECT_STORAGE_PUBLIC_BASE_URL`，必须同步配置 CDN TypeA 鉴权密钥和 TTL。
- 使用真实账号做浏览器 E2E：注册、登录回跳、充值、创作成功/失败扣费、使用记录、团队创建/加入/团队扣费。
- 使用真实账号下载个人、团队、公共图片各一次，验证 `/api/images/download-url` 返回短期签名 URL，浏览器下载流量直连对象存储域名，不走后端转发大文件。
- CDN 生产验收需确认：下载 URL 为 CDN 域名且带 `sign`；去掉 `sign` 或等待过期后返回 403；直接访问 COS 原始对象地址失败；CDN 已具备回源私有 COS 的授权或等效配置。
- 如继续核对团队使用记录，优先用真实团队账号提交一条对话和一条生图，验证团队表价格分别显示类似 `¥0.001` / `¥0.051`，Sub2API 使用记录同步存在对应 commit 记录。
- 如继续开发，优先补生产联调脚本和 Playwright 最小闭环，而不是继续扩展新功能。
- 如继续会话/余额同步，优先做真实浏览器人工切号测试：Sub2 账号 A -> 落叶 -> Sub2 切账号 B -> 回落叶，应跳 `/login` 后重新 launch，不能静默继续用账号 A。
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
- 2026-06-10 04:40 对话价格展示修复验证：
  - `cd F:/java/chatgpt2api && go test ./internal/service -run TestImageTaskServicePublicTaskIncludesPendingBillingCharge -count=1` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - 本地 `chatgpt2api:local-patched` 已重建并替换 `127.0.0.1:8081` 容器，`/health` 返回 `{"status":"ok","version":"0.0.0-dev"}`。
- 2026-06-10 05:00 独立站体验收口验证：
  - `cd F:/java/chatgpt2api && go test ./internal/httpapi -run TestTeamMembersCanLeaveButOwnerCannot -count=1` 通过。
  - `cd F:/java/chatgpt2api && go test ./internal/service -run TestImageTaskServicePublicTaskIncludesPendingBillingCharge -count=1` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - `cd F:/java/chatgpt2api && git diff --check` 无 whitespace 错误，仅 LF/CRLF 工作区提示。
- 2026-06-10 13:50 登录态/余额同步修复验证：
  - `curl.exe -fsS http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"0.0.0-dev"}`；`curl.exe -fsS -o NUL -w "%{http_code}" http://127.0.0.1:62080/health` 返回 `200`。
  - `curl.exe -sSI "http://127.0.0.1:62080/studio-bridge/session-probe?app_id=luoye-ai&parent_origin=http%3A%2F%2F127.0.0.1%3A8081"` 确认 CSP 含 `frame-ancestors http://127.0.0.1:8081`，且不再返回 `X-Frame-Options: DENY`。
  - Playwright 本地浏览器验证：Sub2 测试账号 launch 到落叶 `/image`，`/auth/session` 包含 `sub2api_user_id`，页面没有 API Key/Token/OpenAI-compatible/API 选择/限制 API 文案；清空 Sub2 localStorage 后回落叶自动跳 `/login`，`/auth/session` 为 401，再访问 `/image` 仍停留 `/login`。
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && go test ./internal/httpapi -run "TestSub2APISessionResponseIncludesSessionBinding|TestLuoyeIndependent" -count=1` 通过。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - `cd F:/mcplugins/sub2api/backend && go test ./internal/server/middleware ./internal/server -run "TestSecurityHeaders|TestSetDirective|TestStudioBridgeFrameAncestor|TestAppendFrameOrigin|TestFrameOrigin" -count=1` 通过。
  - `cd F:/mcplugins/sub2api/backend && go test ./...` 通过。
  - `git diff --check` 两仓库均通过，仅 chatgpt2api 有 LF/CRLF 工作区提示。
  - 本地容器已用新 Linux 二进制注入并重启，`chatgpt2api:local-patched` commit 镜像 ID `sha256:5f2592f1d664...`，`sub2api:local` commit 镜像 ID `sha256:0bbba03435a4...`。
- 2026-06-10 17:17 对象存储私有读写收口验证：
  - `cd F:/java/chatgpt2api && go test ./internal/imagestore ./internal/service ./internal/protocol ./internal/httpapi` 通过。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && git diff --check` 通过，仅 Windows LF/CRLF 工作区提示。
- 2026-06-10 18:21 CDN TypeA 鉴权下载补齐验证：
  - `cd F:/java/chatgpt2api && go test ./internal/imagestore ./internal/service ./internal/httpapi` 通过。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && git diff --check` 通过，仅 Windows LF/CRLF 工作区提示。
