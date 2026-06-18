---
title: Luoye Independent Mode
type: architecture
repo: chatgpt2api
last_verified: 2026-06-17
---

# 落叶创艺独立用户版

## 当前定位

- `chatgpt2api` 当前默认产品面是“落叶创艺独立用户版”，不是通用 ChatGPT Web 包装层，也不只是一个被 Sub2API 启动的图片页。
- Sub2API 是注册、登录、充值、余额、默认分组、管理配置和扣费真源。
- `chatgpt2api` 负责本地创作站会话、`/image` 与 `/canvas` 创作体验、团队空间 UI，以及与 Sub2API bridge 的最小必要映射。
- 2026-06-12 之后，这个“独立用户版”已经不再只对应 `/image` 与 `/canvas`；`/image-manager`、`/social`、`/ecommerce-suite`、text assets 和 team usage 也开始共用同一套创作底座。
- 2026-06-16 之后，这套产品面又前移到 Pro Studio 生产模式、电商生产交付和 Gemini reference upload；默认心智不应再停留在“普通图片工作台 + 登录桥接”。

## 默认用户链路

1. 匿名用户访问 `/image`、`/canvas`、`/social`、`/image-manager` 或 `/profile`
2. 先进入 `/login`
3. 登录页跳 Sub2API launch/redeem
4. 落叶本地建立 session
5. 用户直接进入创作台，而不是理解 API Key、Token、OpenAI-compatible 或 API 选择
6. 创作任务按 Sub2API 钱包语义执行预扣、确认、退款

稳定事实：

- 普通用户 UI 不应暴露本地管理员、API 绑定、限制 API、API Key、Token、OpenAI-compatible 或 API 选择入口。
- 顶部余额和充值入口优先读取 Sub2API 钱包摘要。
- 团队模式 v1 的稳定语义是 `team_id`、`payer_user_id`、`actor_user_id` 这组真实扣费上下文，而不是“调用队长 API”。
- `ecommerce-suite` 不是独立业务后端；它复用现有登录态、素材能力、creation-task 和权限边界，属于独立用户版主线继续扩展出来的新工作台。
- `/canvas` 与 `/ecommerce-suite` 的 production mode 已进入默认产品面；普通工作台、生产工作台和团队 usage 现在共享同一套会话、资产和计费语义。

## 登录态与 session-probe

- 顶栏会通过隐藏 iframe 探测 Sub2API 当前浏览器登录态。
- 当 Sub2 未登录或切到不同用户时，落叶会调用本地 `/auth/logout` 清 HttpOnly cookie，再清前端缓存并跳 `/login`。
- 当仍是同一 Sub2 用户时，会强制刷新 `/auth/session` 和钱包，避免余额、账号或团队信息停留在旧缓存。
- Sub2 侧探针已收口到 `/studio-bridge/session-probe`，并要求 `parent_origin` 命中 `launch_return_url` 同源或 `allowed_return_domains`。
- 如果 launch 成功但会话、余额或账号显示异常，优先排查探针 iframe、`/auth/session` 和本地 logout 清理链路，而不是先怀疑纯 UI。

## 扣费与金额语义

- 创作任务走 Sub2API 默认分组和钱包适配器执行。
- 任务前预扣，成功确认，失败或取消退款。
- 普通用户不能通过 `/v1/messages` 或其他协议 API 绕过创作任务扣费。
- 社媒文案生成和 Canvas 提示词节点也已纳入 chat 创作扣费。
- Sub2API 外部金额单位为 `cny_milli`；落叶显示层必须避免把千分元直接按两位小数舍成 `¥0.00`。
- 运行中任务可以展示 `billing_charged_amount` 预扣金额。

## 对象存储与下载

- 前端不再直接拿到 `object_key`、`object_url` 或 `storage_backend` 作为展示输出。
- 图片展示和生成结果统一回站内 `/images/...`。
- 用户下载图片时，通过 `/api/images/download-url` 鉴权后获取短期 presigned `GetObject` URL。
- 如果启用 `CHATGPT2API_IMAGE_OBJECT_STORAGE_PUBLIC_BASE_URL` 和 `CHATGPT2API_IMAGE_OBJECT_STORAGE_CDN_AUTH_KEY`，下载链接改为腾讯云 CDN TypeA 临时签名 URL。
- 生产验收时要确认：
  - 下载 URL 带 `sign`
  - 去掉 `sign` 或等待过期后返回 403
  - 直接访问原始对象地址失败
  - 下载流量直连对象存储/CDN，不走后端大文件转发

## 素材库 / collections

- 可复用素材库 v1 已进入默认产品面。
- 图片元数据支持 `collection_id` / `collection_name`。
- `/api/image-collections` 是默认素材集接口。
- `/image-manager` 提供素材集侧栏、详情面板、批量归类和权限约束。
- `/image`、`/canvas` 侧边图库都支持按素材集筛选。
- `/api/images?collection_id=__unclassified__` 支持未归类筛选。
- 公共图库只读；团队素材集修改仍受 owner / manager 权限约束。
- 当前稳定语义是一张图只能属于一个素材集。

## 多工作台共用创作底座

- `/image`、`/canvas`、`/image-manager`、`/social`、`/ecommerce-suite` 当前应被理解为同一产品面的不同入口，而不是几套彼此独立的子系统。
- `gpt-image-2` 结果序列化、素材引用、session-probe 登录态恢复和钱包扣费语义，是这些工作台共享的稳定后端/前端边界。
- 2026-06-12 的 Output 动作栈与 `ecommerce-suite` 落地说明：后续如果某个工作台的结果回填、下载、素材入库或 usage 展示异常，不要只在单页排查；默认应把 creation-task 输出、素材库和团队 usage 一起看。
- text assets 已进入这套创作底座，说明“独立用户版”默认心智已经扩展到“图片工作台 + 素材管理 + 轻量文本资产 + 电商套图编排”的组合面。
- 2026-06-16 的生产交付闭环进一步说明：ZIP 打包下载、文案保存为 text asset、已完成图片归入项目素材集，也属于同一条默认输出链路，而不是 `ecommerce-suite` 私有逻辑。

## Pro Studio / Gemini 新稳定边界

- `/canvas` 与 `/ecommerce-suite` 都已支持 production mode，显示用途、等级、高级 official 设置和 `gpt-image-2-official` 锁模。
- 电商生产模式当前稳定支持商品主图、电商横幅、详情页竖图、场景图和 SKU 批量图；SKU `8/12` 张预览按 `4+4` / `4+4+4` 拆分。
- 生产交付不再只是参数面板：ZIP 下载、text asset 保存、图片归档项目素材集已经进入默认交付闭环。
- Gemini 图片模型当前按 preview 路由理解，并支持 reference uploads；后续再看 Gemini 兼容问题时，不应沿用旧入口或旧 payload 心智。
- 因此后续凡是涉及 Pro Studio、官方生图、Gemini reference、素材归档或 team usage 的问题，默认都要把 `/canvas`、`/ecommerce-suite`、creation-task 输出和素材库一起看。

## 最小验证清单

- 命令：
  - `cd F:/java/chatgpt2api && go test ./...`
  - `cd F:/java/chatgpt2api/web && npm.cmd run lint`
  - `cd F:/java/chatgpt2api/web && npm.cmd run build`
- 定向后端：
  - `go test ./internal/httpapi -run "TestLuoyeIndependent|TestSub2APISessionResponseIncludesSessionBinding" -count=1`
  - `go test ./internal/imagestore ./internal/service ./internal/protocol ./internal/httpapi`
- 最小浏览器闭环：
  - 匿名访问 `/image` 或 `/canvas` 会进 `/login`
  - 登录回跳后进入创作页
  - 顶部不暴露 API 相关入口
  - 探针 iframe 源为 Sub2API `/studio-bridge/session-probe`
  - `/auth/session` 和余额在切号后不会继续沿用旧用户
  - 下载个人 / 团队 / 公共图片时返回短期签名 URL
  - `/image-manager`、`/image`、`/canvas` 能按全部 / 未归类 / 素材集筛选
  - `ecommerce-suite` 进入后仍复用现有登录态和资产/输出链路，不出现独立鉴权或独立结果语义
  - `/canvas` 与 `/ecommerce-suite` production mode 都能打开，`gpt-image-2-official` 锁模和 SKU 拆分预览不退化
  - Gemini 图片模型仍走 preview/reference 语义，不回退到旧字段组合

## 现在优先排查什么

- launch 成功但页面仍像旧用户：先看探针 iframe、`/auth/session`、本地 `/auth/logout` 清理是否生效。
- 价格显示异常：先确认是不是 `cny_milli` 显示精度问题，而不是扣费没发生。
- 下载链路异常：先区分站内 `/images/...` 展示、`/api/images/download-url` 鉴权、对象存储 presign、CDN TypeA 签名四层。
- 素材库异常：先看 `collection_id`、未归类筛选、团队 owner/manager 权限和公共图库只读边界。
- 团队扣费争议：先看 `team_id`、`payer_user_id`、`actor_user_id` 和 Sub2API 对应 commit 记录。
- 新工作台结果或 team usage 展示异常：先看 creation-task 输出序列化、Output 动作栈、素材链路和团队 usage 页面是否仍共用同一套会话/计费语义。
- 生产模式或 Gemini 兼容异常：先看 official route / preview route、reference upload、结果序列化和项目素材集归档，而不是先把问题归到单个页面。

## 仍未验证的边界

- 真实支付回调和真钱充值
- 真实上游创作成功扣费 / 失败退款
- 团队 manager 与普通成员在真实素材集上的完整权限 E2E
- CDN 私有回源的生产配置细节
- 网络超时、数据库故障注入和迁移演练
