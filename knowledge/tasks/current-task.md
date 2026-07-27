# Current Task

最后更新：2026-07-21 22:20 +08:00

## 背景

`chatgpt2api` 的稳定产品底座仍然是“落叶创艺独立用户版 + Sub2API 作为用户/余额/充值/扣费真源 + 多工作台共用创作链路”。截至 2026-07-21，当前会话事实源已经前移到 `task-020-image-tool-text-response-hardening` 已 PASS，`task-013` restart recovery 仍是下一合法动作。

最新工作流状态来自 `docs/workflow/status.md`：当前阶段是 `done`，当前 Sprint 是 `task-020-image-tool-text-response-hardening`。这说明默认续做入口已经不再停在 7 月上旬的 `task-014-canvas-batch-layout`，而是先承认 `task-020` 的 text-only hardening 已落盘，再把剩余的 `task-013` 安全续跑问题单独拆出来。

同时，2026-07-21 的最新结论还明确了：强制生图工具收到普通文本或空图片结果时，不能再伪装成图片成功；`/v1/responses` image-tool text-only 直接返回 `HTTP 400 / image_generation_text_response`，generate/edit/video text-only creation-task 为 error、图片消费 0，reserve/refund 重复结算不重复退款。后续若继续排查图片任务计费、usage 解释或 restart recovery，不能只看金额和状态，还要一起看模型、任务类型和退款幂等。

## 当前主线

- 当前最新已完成的是 `task-020-image-tool-text-response-hardening`：
  - 普通文本、空输出和真实图片调用已经分流，text-only 不再伪造成图片成功。
  - 这条边界只说明 checkout 结论，不外推真实账号、真实上游或线上容器。
- 当前剩余的下一合法动作是 `task-013` restart recovery：
  - 继续推进时要单独新建 contract，沿用既有 creation-task、内容策略、并发和 Sub2API 结算链路。
  - `task-013` 的核心遗留阻断仍是服务重启后的安全续跑，而不是 `task-014` 的 batch layout。
- 独立用户版、多工作台和 bridge 计费仍然是背景主链：
  - `/image`、`/canvas`、`/image-manager`、`/social`、`/ecommerce-suite` 共用同一套登录态、素材输入、creation-task 输出和钱包扣费底座。
  - `web_search` chat mode、素材库 `图片 / 文本 / 视频` 顶层分组、统一 image model settings、asset sidebar 的 `image / video` 切换、pending settlement retry 等稳定边界继续成立。
  - 团队模式 v1 仍按 `team_id / payer_user_id / actor_user_id` 语义理解；排障时不要把当前主线误收回成旧的单页图片工作台或只剩 bridge 联调。

## 已稳定事实

- `task-020-image-tool-text-response-hardening` 已 PASS：普通文本、空输出和真实图片调用已分流；text-only image-tool 返回 `HTTP 400 / image_generation_text_response`；generate/edit/video text-only creation-task 为 error、图片消费 0；reserve/refund 重复结算不重复退款。
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
- 2026-06-11 可复用素材库 v1 已落地：图片元数据支持 `collection_id/collection_name`；新增 `/api/image-collections`；`/image-manager` 提供素材集侧栏、详情面板、批量归类和创作引用；`/image`、`/canvas` 侧边图库可按素材集筛选；`/image` 输入区有轻量 `@素材` 选择器，可从当前素材筛选结果加入参考图；公共图库只读、团队素材集修改仍受 owner/manager 权限约束。
- 2026-06-11 素材库体验补齐已落地：用户可见“图片库/图库”已统一为“素材库”；`/api/images?collection_id=__unclassified__` 支持未归类筛选；素材集接口返回 `unclassified_count`；`/image-manager`、`/image`、`/canvas` 均支持全部/未归类/素材集筛选；详情与批量归类入口补充“一张图只能属于一个素材集”、公共只读和团队权限提示；session-probe iframe 只加载 `/studio-bridge/session-probe`。
- 2026-06-12 `/canvas` Output 动作栈已进入稳定默认行为：输出图不再按“最新一次结果覆盖全部历史”理解，而是按动作栈保留连续输出；后续看到结果回填异常时，要先按动作链而不是单张结果心智排查。
- 2026-06-12 `gpt-image-2` creation-task 输出序列化已收口为稳定后端边界；图片结果、素材入库、`/canvas` 回填和后续多工作台输出都依赖同一套序列化语义。
- 2026-06-12 `ecommerce-suite` 与 text assets 已落地为新的普通用户工作台：它们复用现有登录态、权限、素材输入和 creation-task，而不是新的后端系统。
- 2026-06-13 电商套图工作台和团队使用页继续收口：当前默认产品面已不只是“独立用户版 + 素材库”，而是“独立用户版 + 多工作台共用创作底座 + team usage 展示语义”。
- 2026-06-15 `/image` 创作台输入栏继续按移动端极简收口：提示词市场入口已从创作台移除；桌面端不再显示“素材”按钮，改由右侧素材库承担素材调用；移动端仍保留素材图标入口，因为移动端没有常驻右侧素材库。
- 2026-06-15 移动端左侧功能抽屉里的 `/image` 历史记录已压成一行条目：列表仅显示标题，轮数和时间收进 `title/aria-label`，运行/排队状态用同一行短标签提示。
- 2026-06-15 移动端左侧功能抽屉底部账号区已简化：常驻区域只保留头像、用户名和展开箭头；角色、余额、版本、深色模式、充值、个人中心和退出登录全部收进点击用户后的弹出菜单。
- 2026-06-15 `/image` 移动端输入框位置微调：底部 composer dock 下压，外层移动端底部 padding 归零，输入框自身保留 `safe-area + 4px`，减少底部空白但不贴住手势区。
- 2026-06-15 `/canvas` 移动端底部控制继续极简化：底部不再常驻左侧三小按钮和右侧缩放胶囊，改为单个大号“画布工具”按钮；小地图、运行记录、适配画布、上传、添加节点、最近操作、清理空白节点和保存兜底统一放入底部工具抽屉。移动端缩放主要交给双指手势，桌面端缩放工具保持不变。
- 2026-06-15 `/canvas` 桌面端顶部 More 菜单清理：桌面主工具栏已常驻展示上传、提示词、AI 提示词、循环、组、图片生成、视频、Output、帮助；More 菜单不再重复这些节点入口，仅保留最近操作和清理空白节点等辅助操作。
- 2026-06-16 Pro Studio 生产模式已进入稳定默认面：`/canvas` 与 `/ecommerce-suite` 都支持 production mode，显示用途、等级、高级 official 设置和 `gpt-image-2-official` 锁模；电商生产模式支持商品主图、电商横幅、详情页竖图、场景图和 SKU 批量图。
- 2026-06-16 电商生产交付闭环已进入稳定默认面：ZIP 打包下载、文案保存为 text asset、已完成图片归入项目素材集，说明生产模式不再只是参数面板，而是实际交付链路。
- 2026-06-16 Gemini 图片模型兼容边界已更新：Gemini 图片模型切到 preview 路由，并支持 reference uploads；后续再看模型兼容问题时，应按新 preview/reference 语义排查。
- 2026-06-18~2026-06-19 图片模型设置基线继续收口：`/image`、`/canvas`、`/ecommerce-suite` 已继续接入和整理统一的 image model settings 面板；后续如果某个工作台的模型标签、参数区或默认值异常，优先按共享配置层排查，而不是先假设是单页 UI 独有问题。
- 2026-06-18~2026-06-19 品牌与文案收口继续推进：模型标签默认隐藏上游品牌，工作台更偏向站内产品语义；后续知识入口不应再把“暴露上游品牌名”当成正常默认行为。
- 2026-06-19 image gateway 模型支持已进入稳定候选面：这说明当前图片工作台不再只围绕 official/非 official 两条老路径，而是在向“多图片模型网关 + 统一设置/校验”演进。
- 2026-06-19 上游错误归一已形成新的后端默认边界：图片内容策略错误、尺寸错误与 Midjourney generation count 已开始统一映射；后续如果前端提示文案、错误态或重试逻辑异常，应先查统一归一层而不是分散页面逻辑。
- 2026-06-21 image arena 已进入新的稳定候选面：多图结果现在更适合按单个 run 的主图 + 缩略图切换、预览/下载/收藏/送电商动作聚合理解，而不是继续按长列表图片块理解。
- 2026-06-22 临时参考图签名 URL 已进入新的稳定后端边界：后续任何“引用图突然失效/继续编辑拿不到图/跨页结果回填丢图”的问题，都要优先检查签名临时 URL 与过期语义。
- 2026-06-24 mixed Sub2API image edits 已补齐 multipart 保图边界：`fix: keep json image edits on multipart references` 与 `fix(httpapi): route mixed sub2api image edits as multipart` 说明当前编辑链路已经默认要求保住同一组 references；若 mixed 路径再次把 JSON edit 误走成不带 multipart 的请求，应视为主线回归。
- 2026-06-25 `/canvas` pixel icon 预览强化已完成：后续如果画布节点缩略图、像素类图标或小尺寸结果辨识性回退，不应再把它当成纯样式微调，而要按当前工作台稳定交互回归处理。
- 2026-06-25 `/profile` recharge history 已默认隐藏：普通用户入口继续避免暴露不必要的支付历史信息；后续若 profile 又重新膨胀，先确认是否真的属于独立创作站主链。
- 2026-07-01 `/image` chat mode 联网搜索已进入新的稳定候选面：后续若文本创作结果风格、payload 拼接或任务重试异常，先确认 `web_search` 是否开启、搜索 query 是否有效，以及搜索上下文是否已注入，而不是直接把问题归到模型随机性。
- 2026-07-01 团队 remark 可见性已进入新的稳定权限边界：owner/manager 之外不应再拿到成员备注；后续涉及团队公开载荷、成员列表和 profile 展示时，应把它视为默认隐私约束而不是临时前端细节。
- 2026-07-01~2026-07-03 素材库三大分类已进入新的稳定产品边界：当前素材库默认首先区分 `图片 / 文本 / 视频`，每类下再做分组/归类；后续不要再把 text assets、video assets 和 image collections 当成互不相干的平行系统。
- 2026-07-05 Sub2API bridge 图片计费元数据已进入新的稳定候选面：当前桥接扣费不再只是“这次花了多少钱”，还开始记录图片张数、尺寸和尺寸来源；后续若 Sub2API 侧 usage 细节、bridge 账单或图片成本解释和前端预期不一致，优先检查 metadata 组装与尺寸归一，而不是只看金额换算。
- 2026-07-05 `/canvas` 资产侧栏媒体切换已进入新的稳定候选面：图片/视频资源库开始复用同一侧栏容器和计数/刷新/切换语义，后续若视频资产入口失效、图片计数异常或素材切换后状态串类，不要只按独立视频面板理解。
- 2026-07-06 pending settlement retry 已进入新的稳定候选面：后续若 Sub2API usage、bridge 账单或落叶侧任务状态出现“任务成功但结算挂起”的情况，先检查 settlement retry 状态机和重试入口，而不是直接把问题归到上游超时或前端轮询。

## 下一步

- 上线前先整理生产部署清单，确认两个站点域名、回跳 URL、充值 URL、内部密钥、默认分组、对象存储地域和 bucket 私有读写策略。
- 如继续做图片工作台 follow-up，优先补一轮跨页面最小 smoke：`/image`、`/canvas`、`/ecommerce-suite` 至少各验证一次模型设置面板、模型标签隐藏、提交 payload、image arena 结果交互和错误提示是否一致。
- 如继续做 7/1 之后的默认主线，优先补一轮 `/image` chat mode 联网搜索最小 smoke：开启/关闭开关各跑一次，并覆盖未配置搜索网关、空 query 和正常搜索结果注入三种分支。
- 如继续做 7/2 之后的默认主线，再补一轮素材库三大分类最小 smoke：确认 `/image-manager`、图片/视频资产侧栏和 text asset 入口默认先按 `图片 / 文本 / 视频` 分流，再看各类内部归组是否一致。
- 如继续做 7/5 之后的 bridge / 资产面 follow-up，优先补一轮图片计费元数据 smoke：至少确认 `generate/edit` 任务提交后，bridge 侧 charge payload 会带上 `image_count`、`image_size` 和 breakdown，且 `image_resolution`/`requested_size` 的归一结果符合当前 `1K / 2K / 4K` 语义。
- 如继续做 7/6 之后的 bridge 账单 follow-up，再补一轮 pending settlement retry smoke：至少覆盖一条挂起结算重试后恢复成功的链路，并确认状态转换后 usage/账单展示与图片任务记录一致。
- 如继续做 7/5 之后的 `/canvas` 资产面验收，再补一轮图片/视频媒体切换 smoke：确认同一素材侧栏里 `图片`/`视频` 切换、计数、刷新、空态和加入画布动作都正常，不再依赖额外打开独立视频面板。
- 如继续做团队侧验收，优先补 owner / manager / member 三种身份查看团队成员列表，确认普通成员不再看到 `remark`。
- 如继续做 6/25 之后的工作台小收口验收，优先补一轮真实浏览器检查：`/canvas` pixel icon 预览在常见缩放下是否可辨，`/profile` 是否继续保持最小用户视图而没有把充值历史重新带回。
- 如继续做图片协议/上游兼容回归，优先补 Midjourney APIMart 参数、unsupported ratio warning 和 official image edit reference URL 化这三条最小链路，确认当前提示与 payload 已对齐。
- 如继续做知识或验收，优先把 `/image`、`/canvas`、`/ecommerce-suite`、素材库和 team usage 当成同一条创作底座补最小浏览器闭环，而不是分散按单页验收。
- 如继续做后端联调，优先补真实账号下的 account image input URL、signed temp reference image URL 与继续编辑/参考图回填闭环。
- 对象存储生产配置建议改为私有读写：`CHATGPT2API_IMAGE_OBJECT_STORAGE_ACL=private` 或留空使用 bucket 默认私有；如配置 `CHATGPT2API_IMAGE_OBJECT_STORAGE_PUBLIC_BASE_URL`，必须同步配置 CDN TypeA 鉴权密钥和 TTL。
- 使用真实账号做浏览器 E2E：注册、登录回跳、充值、创作成功/失败扣费、使用记录、团队创建/加入/团队扣费。
- 使用真实账号下载个人、团队、公共图片各一次，验证 `/api/images/download-url` 返回短期签名 URL，浏览器下载流量直连对象存储域名，不走后端转发大文件。
- CDN 生产验收需确认：下载 URL 为 CDN 域名且带 `sign`；去掉 `sign` 或等待过期后返回 403；直接访问 COS 原始对象地址失败；CDN 已具备回源私有 COS 的授权或等效配置。
- 如继续核对团队使用记录，优先用真实团队账号提交一条对话和一条生图，验证团队表价格分别显示类似 `¥0.001` / `¥0.051`，Sub2API 使用记录同步存在对应 commit 记录。
- 如继续开发，优先补生产联调脚本和 Playwright 最小闭环，而不是继续扩展新功能。
- 如继续做真实上游回归，优先补 Midjourney generation count、image size validation 和内容策略错误归一的人工验证，确认统一错误映射没有误伤现有工作台提示文案。
- 如继续素材库验收，入口链路和 `/image` 素材库 smoke 已通过；下一步优先用有真实图片的登录态浏览器跑 `/image-manager` 新建 `ui` 素材集、批量加入/移出、团队 manager 与普通成员权限、公共图库只读，以及 `/canvas` 从素材集加入画布。
- 如继续新工作台验收，优先补 `ecommerce-suite` 与 Pro Studio 的最小浏览器闭环：进入工作台、切换 production mode、读取示例/项目状态、触发结果进入现有资产/输出链路，并确认团队页 usage 语义没有与旧页面脱节。
- 如继续会话/余额同步，优先做真实浏览器人工切号测试：Sub2 账号 A -> 落叶 -> Sub2 切账号 B -> 回落叶，应跳 `/login` 后重新 launch，不能静默继续用账号 A。
- 生产环境仍需人工确认真实支付回调、真实上游创作扣费、网络超时/DB 故障注入和迁移演练；本地验收不触碰真钱支付，也不消耗真实上游模型。
- 如继续官方生图或 Gemini 兼容验收，优先补 `gpt-image-2-official` 真上游可用性、Gemini reference upload 和电商生产模式下批量任务的真实账号 E2E。

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
- 2026-06-11 可复用素材库 v1 验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && go test ./internal/service ./internal/httpapi` 通过。
  - `cd F:/java/chatgpt2api && go test ./...` 通过。
  - `cd F:/java/chatgpt2api && git diff --check` 通过，仅 Windows LF/CRLF 工作区提示。
  - 首轮未执行真实浏览器素材库验收，需后续用登录态补测个人/团队/公共 scope 和创作台/Canvas 引用链路。
- 2026-06-11 素材库体验补齐与 Studio Bridge 本地修复验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - `cd F:/java/chatgpt2api && go test ./internal/service ./internal/httpapi` 通过。
  - `cd F:/mcplugins/sub2api/backend && go test ./internal/service ./internal/server` 通过。
  - 两仓库 `git diff --check` 通过，仅 chatgpt2api 有 Windows LF/CRLF 工作区提示。
  - 本地容器已更新并健康：`chatgpt2api:local-patched` 运行在 `127.0.0.1:8081`，`sub2api:local` 运行在 `127.0.0.1:62080`；`/health` 均正常。
  - 浏览器 smoke：一次性本地用户注册后从 `http://127.0.0.1:62080/chat-images` 成功跳转到 `http://127.0.0.1:8081/image`；网络记录显示 `POST /api/v1/user/studio-bridge/launch`、`POST /auth/sub2api/launch`、Sub2API `redeem/user-summary` 均 200；iframe `src` 为 `/studio-bridge/session-probe?...parent_origin=http://127.0.0.1:8081`，performance entries 中没有 `http://127.0.0.1:62080/` 根路径 iframe 请求，控制台未出现 `frame-ancestors 'none'` / CSP iframe 报错。
  - 仍未完整跑 `/image-manager` 有图归类和 `/canvas` 加入画布的点击验收；需要后续用有素材数据的登录态继续补。
- 2026-06-15 创作台输入栏精简验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - Playwright 验收 `output/playwright/image-composer-toolbar-check.mjs` 通过桌面 `1365x900` 与移动 `390x844`：均无横向溢出；桌面不显示“市场/素材”按钮且右侧素材库仍在；移动端不显示“市场”，但保留 `aria-label="从素材库加入参考图"` 的素材图标按钮。
  - 本地容器已更新并健康：`chatgpt2api` 运行镜像 `chatgpt2api:codex-20260615-135416`，`chatgpt2api:local-patched` 指向同一镜像，数据目录挂载为 `F:/java/chatgpt2api/data:/app/data`；`http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"local-image-composer-no-market"}`。
  - 截图证据：`output/playwright/image-composer-desktop-after-container.png`、`output/playwright/image-composer-mobile-after-container.png`。
- 2026-06-15 历史记录一行化验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - Playwright mock 历史验收 `output/playwright/image-history-one-line-check.mjs`：移动端抽屉可见历史按钮高度为 `28px`，无横向溢出；截图 `output/playwright/image-history-one-line-mobile.png`。
  - 本地容器已更新并健康：`chatgpt2api` 运行镜像 `chatgpt2api:codex-20260615-141752`，`http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"local-history-one-line"}`。
- 2026-06-15 移动端账号底部简化验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - Playwright 验收 `output/playwright/mobile-nav-account-footer-check.mjs`：移动端抽屉闭合态底部只显示头像/用户名/箭头；点击后菜单显示角色、余额、版本、充值、深色模式、个人中心和退出登录；无横向溢出。
  - 本地容器已更新并健康：`chatgpt2api` 运行镜像 `chatgpt2api:codex-20260615-142454`，`http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"local-mobile-account-footer"}`。
  - 截图证据：`output/playwright/mobile-nav-account-footer-closed.png`、`output/playwright/mobile-nav-account-footer-open.png`。
- 2026-06-15 移动端输入框下压验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - Playwright 截图 `output/playwright/image-mobile-composer-lower.png`：输入框更接近底部，仍保留安全区；无横向溢出。
  - 本地容器已更新并健康：`chatgpt2api` 运行镜像 `chatgpt2api:codex-20260615-144045`，`http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"local-mobile-composer-lower"}`。
- 2026-06-15 `/canvas` 移动端单按钮工具层验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - Playwright mock 验收 `output/playwright/canvas-mobile-single-tool-check.mjs` 通过：`390x844` 默认仅显示一个“画布工具”按钮；不显示小地图/运行记录独立按钮；不显示移动端缩放百分比胶囊；工具抽屉包含小地图、运行记录、适配画布、上传和立即保存兜底；运行记录可从抽屉打开。
  - 截图证据：`output/playwright/canvas-mobile-single-tool-default.png`、`output/playwright/canvas-mobile-single-tool-drawer.png`、`output/playwright/canvas-mobile-single-tool-minimap.png`、`output/playwright/canvas-mobile-single-tool-history.png`。
  - 本地容器已更新并健康：`chatgpt2api` 运行镜像 `chatgpt2api:codex-20260615-161100`，`chatgpt2api:local-patched` 指向同一镜像，数据目录挂载为 `F:/java/chatgpt2api/data:/app/data`；`http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"local-canvas-mobile-tool-button"}`。
- 2026-06-15 `/canvas` 桌面 More 菜单清理验证：
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
  - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
  - 本地容器已更新并健康：`chatgpt2api` 运行镜像 `chatgpt2api:codex-20260615-225700-more-menu-clean`，`chatgpt2api:local-patched` 指向同一镜像；`http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"local-canvas-more-menu-clean"}`。
 - 2026-06-16 Pro Studio / 电商生产交付验证：
   - `go test ./internal/service -run 'Test(ImageServiceImageDetailReturnsProStudioMetadata|ImageTaskServicePreservesProStudioMetadata|NormalizeProStudioRequest|ValidateProStudioRequest)' -count=1` 通过。
   - `go test ./internal/httpapi -run 'TestCreationTaskProStudio' -count=1` 通过。
   - `go test ./internal/service ./internal/httpapi -count=1` 通过。
   - `cd F:/java/chatgpt2api/web && npm.cmd run lint` 通过。
   - `cd F:/java/chatgpt2api/web && npm.cmd run build` 通过。
   - `cd F:/java/chatgpt2api && go test ./...` 通过。
   - Playwright smoke：`output/playwright/pro-studio-ecommerce-workbench-smoke.mjs`、`output/playwright/ecommerce-production-delivery-smoke.mjs` 通过。
   - 容器检查：`http://127.0.0.1:8081/health` 返回 `status=ok`，版本 `local-20260616-ecommerce-production-delivery`；`/ecommerce-suite` 返回 200 且包含前端资源入口。
   - 浏览器验收：`/canvas` 普通模式与生产模式均可打开；`/ecommerce-suite` 生产模式可切换；SKU `8/12` 张预览分别为 `4+4` / `4+4+4`。
   - 截图证据：`output/playwright/pro-studio-canvas-production-mode.png`、`output/playwright/pro-studio-ecommerce-smoke.png`、`output/playwright/pro-studio-ecommerce-sku-batch-smoke.png`、`output/playwright/pro-studio-ecommerce-workbench-smoke.png`、`output/playwright/ecommerce-production-delivery-smoke.png`。
