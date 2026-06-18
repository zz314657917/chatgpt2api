---
title: Current Focus
type: status
repo: chatgpt2api
last_verified: 2026-06-18
---

# 当前稳定心智模型

chatgpt2api 当前不应再被理解为单纯“ChatGPT 官网能力封装服务”，也不应只理解成“Sub2API 跳转过来的图片工作台”。最近稳定主线已经从 6 月初的 image workspace + `/canvas` 工作台，进一步推进到“落叶创艺独立用户版 + Sub2API 作为用户/余额/充值/扣费真源 + 现有 `/image` 和 `/canvas` 能力作为创作底座”的三层产品面。

- 面向普通用户的独立创作站。
- 面向 Sub2API bridge 的注册、登录、充值和余额真源接入。
- 面向图像创作链路的 `/image` 工作台、`/canvas` 自研节点画布与 Pro Studio 生产模式。
- 面向团队共享额度 v1 的 actor / payer 扣费语义。
- 面向 `ecommerce-suite`、text assets 和多工作台共用创作底座的生产交付流。

## 当前主线

- `Sub2API launch/redeem -> 本地登录态 -> /image 或 /canvas 创作 -> 钱包预扣/确认/退款 -> 使用记录/团队空间` 已经成为默认产品链路。
- Sub2API 是用户、余额、充值、管理配置和扣费的唯一真源；chatgpt2api 只保留必要用户映射、创作站会话和前端产品面。
- 未登录访问用户页时，会先进入 `/login`，再由登录页跳 Sub2API；普通用户默认不再暴露 API Key、Token、OpenAI-compatible 或本地管理员相关入口。
- 顶部余额、充值入口和团队共享额度语义已经进入默认产品面；后续问题不要再只按 image workspace 或 white-label 细节理解。
- 6 月 10 日之后，这条默认产品链又补进了三个稳定层：
  - `session-probe` iframe + 本地 `/auth/logout` 清理组成的登录态同步层
  - 站内 `/images/...` 展示 + `/api/images/download-url` + CDN TypeA 临时签名组成的对象存储下载层
  - `collection_id` / 未归类筛选 / 团队素材权限组成的素材库 collections 层
- `/image` 与 `/canvas` 仍是创作底座：连续编辑、继续创作、结果回填、自研画布、视频节点 fail-closed 和参数归一规则继续成立，但它们现在服务于独立用户版而不再是唯一主线。
- `embedded session recovery + bound Sub2API key preservation` 仍是这条链路的稳定默认约束，而不只是 launch 页或登录页的小修。
- 2026-06-16 之后，默认产品面已继续前移到 `Pro Studio production mode + ecommerce-suite production delivery + Gemini preview/reference upload`：
  - `/canvas` 与 `/ecommerce-suite` 都已支持生产模式，不再只是普通图片工作台的附属页面。
  - `gpt-image-2-official`、batch 生产参数、官方 size 白名单、WebP/JPEG compression 和 public reference URL 已进入稳定实现边界。
  - `Gemini` 图片模型已切到 preview 路由，并支持 reference uploads；后续再看图片协议兼容问题时，不应沿用旧的 Gemini 路径心智。
- 2026-06-18 开始，`ecommerce-suite` 的“交付闭环”又前移到“排版编排”层：
  - 已完成图片不再只按固定顺序展示，而是允许在工作台里自定义参与排版的图片、上下调整顺序，并实时预览拼图结果。
  - 当前排版配置会持久化到项目本地状态；后续重新打开项目时，顺序、筛选、背景、适配模式和标题栏开关应被视为同一条稳定工作流，而不是一次性 UI 临时态。
  - “下载拼图”和“生成 AI 合成图”都依赖当前排版结果；后续排查交付链路时，不能再把 summary composite 当成与工作台排版无关的独立动作。

## 已稳定结论

- 当前项目仍不支持 `SuperGrok` / `Grok` / `xAI`；如果要支持，属于新增集成决策。
- 落叶创艺独立用户版当前的稳定边界是：用户通过 Sub2API 注册/登录/充值，chatgpt2api 不再要求普通用户理解 API 概念或手动绑定本地能力入口。
- `image` 相关默认心智已经包含：
  - 创建聊天时保留 draft。
  - 生成结果可拖回编辑器继续编辑。
  - continued edits 使用本地结果 URL，而不是依赖外部临时地址。
  - 每用户图片保留上限已经收口为稳定配置约束。
  - image workspace policies 已进一步 harden，不应再把早期宽松行为当默认。
- 当前产品线里，`white label profile experience` 与旧 leaf login 更像背景层；真正需要优先理解的是独立用户版 bridge、钱包扣费语义和生产联调闭环。
- 登录入口当前至少要区分普通本地登录与 leaf network / linux.do launch login，不应再把登录页当成纯静态表单。
- 当前 embedded mode 默认还要满足以下会话约束：
  - stale token 或前端 store 失效后，允许从 cookie 恢复嵌入会话，而不是直接把用户打回匿名态。
  - 从 Sub2API launch 进入时，已绑定的 Sub2API API key 不应在 session 初始化过程中被覆盖、清空或误判成未绑定。
  - 嵌入模式下的认证保持优先级高于主题 reveal、provider 名称提示等纯展示体验；后者可以降级，认证连续性不能退化。
- 管理端异步创作任务资源仍以 `/api/creation-tasks` 为根，并通过 `image-generations`、`image-edits`、`chat-completions`、`video-generations` 等子资源表达场景。
- 团队模式 v1 当前只承诺“团队共享额度”最小可用闭环，知识入口应优先记录 `team_id`、`payer_user_id`、`actor_user_id` 语义，而不是把它误写成“调用队长 API”。
- 隐藏 iframe 探针现在是默认登录态恢复机制的一部分；它不是临时调试页。若 Sub2 用户切换或退出，落叶必须清本地 HttpOnly cookie、前端缓存并回到 `/login`，不能继续持有旧用户。
- 图片前端展示和下载已不再直接暴露对象存储元数据；如果要看真实下载能力，默认应从站内 `/images/...` 和 `/api/images/download-url` 入手，而不是继续假设前端持有 `object_url`。
- 腾讯云 CDN TypeA 临时签名已经是当前受支持的生产下载路径之一；因此对象存储验收不再只是“图能打开”，还要验证 `sign`、TTL 和原始对象地址不可直读。
- 素材库 collections 已进入当前稳定产品面：`/image-manager`、`/image`、`/canvas` 都能按全部 / 未归类 / 素材集筛选；公共只读、团队 owner/manager 写权限和“一图一素材集”是默认边界。
- `/canvas` 当前仍是“复用现有能力的前端工作台”，不是独立后端系统：
  - 节点数据不保存 API key、`base_url`、`group_id`。
  - 图片本体继续由现有图片库和对象存储管理，画布只保存引用。
  - API 生成节点继续复用现有图片生成/编辑任务链路，不单开新调度后端。
- 当前 `/canvas` 默认约束还包括：
  - 已保存的空智能画布保持空白，不再每次加载都强行补默认节点。
  - 生成节点 queued/running 时禁用重复提交，并在重新打开画布时恢复轮询。
  - 运行时如果没有 `result` 下游，会自动创建并连线。
  - 视频节点能力依赖 Sub2API 绑定；没有绑定时相关模型应直接隐藏，而不是展示后报错。
- 图片参数共享配置当前也已稳定：
  - 前端 `auto` 分辨率只作为 UI 值，不作为 `image_resolution` 提交。
  - 像素图标尺寸作为明确 `size`，不叠加分辨率预设。
  - 后端把 `1080p` 归一到上游 `1k`，并统一 `output_format/output_compression` 规范。
- Pro Studio / 电商生产模式当前也已进入稳定默认面：
  - `/canvas` 生产模式会显示用途、等级、高级 official 设置和 `gpt-image-2-official` 锁模。
  - `/ecommerce-suite` 生产模式支持商品主图、电商横幅、详情页竖图、场景图和 SKU 批量图，SKU `8/12` 张预览按 `4+4` / `4+4+4` 拆分。
  - ZIP 打包下载、文案保存为 text asset、已完成图片归入项目素材集，已经是当前工作台交付闭环的一部分。
  - 6/18 新增的 summary layout 说明，`/ecommerce-suite` 现在还包含“排版方式 + 参与图片选择 + 顺序编排 + 拼图导出/AI 合成”这一层稳定交付能力；后续不能只按 ZIP、素材归档和 text asset 理解它的输出链路。
- 当前多工作台默认共用同一套 creation-task 与输出序列化语义：
  - `/image`
  - `/canvas`
  - `/image-manager`
  - `/ecommerce-suite`
  - Pro Studio 生产工作台
  后续如果只按单页 UI 心智排查，很容易漏掉跨工作台的结果回填、素材归档和 team usage 连动。

## 当前推荐补读路径

- 后端入口：
  - `internal/httpapi/sub2api.go`
  - `internal/service/sub2api_launch.go`
  - `internal/service/image.go`
  - `internal/service/image_task.go`
  - `internal/config/config.go`
- 前端入口：
  - `web/src/app/image/page.tsx`
  - `web/src/app/auth/sub2api/launch/page.tsx`
  - `web/src/lib/api.ts`
  - `web/src/app/canvas/page.tsx`
  - `web/src/app/canvas/use-smart-canvas-controller.ts`
  - `web/src/app/canvas/canvas-node.tsx`
  - `web/src/app/canvas/canvas-utils.ts`
  - `web/src/app/ecommerce-suite/page.tsx`
  - `web/src/components/pro-studio/pro-studio-panel.tsx`
  - `web/src/store/ecommerce-suite-projects.ts`
- 生产工作台/协议入口：
  - `internal/httpapi/sub2api.go`
  - `internal/service/pro_studio.go`
  - `internal/service/image_parameters.go`
  - `web/src/lib/pro-studio/pro-studio-payload.ts`
  - `web/src/lib/pro-studio/official-image-capabilities.ts`

## 当前剩余重点

1. 把 Pro Studio 生产模式、电商生产交付、6/18 的 summary layout 编排，以及 Gemini reference upload 的默认边界继续下沉到稳定专题知识，不要只留在 `current-task` 或 workflow 产物。
2. 把 2026-06-09 之后的独立用户版主线继续下沉到稳定知识，包括生产域名/回跳 URL/bridge secret/默认分组、余额展示、充值入口、预扣确认退款和团队空间最小闭环。
3. 如果继续推进 Sub2API 集成，继续把 launch/redeem、embedded session 恢复、bound key 保持、钱包扣费、图片任务、对象存储、`/image`、`/canvas` 与 `ecommerce-suite` 之间的关系固化到专题知识，而不是只留在提交历史。
4. 如果准备公开说明能力边界，要显式区分“当前已支持的独立用户版、Sub2API 登录充值、image workspace、canvas workspace、Pro Studio 生产模式、电商生产交付、受绑定约束的视频节点、团队共享额度 v1”与“尚未支持的 Grok/xAI、ComfyUI、独立 GPU 工作流”。

## 不要误判的点

- 当前不是继续围绕“品牌改名/去掉外链/隐藏本地账号能力”做主线开发；那些更像已完成的白标收口事实。
- 当前也不是通用多模型扩展仓库；最近主线集中在独立用户版入口、钱包/扣费桥接，以及图片工作台与节点画布的实际创作闭环。
- 不要把 `/canvas` 误判成引入了 ComfyUI、Infinite-Canvas 代码或新的图像调度后端；当前只是站内已有图片链路上的新工作台。
- 不要把 embedded session / bound key 修复误判成单纯 auth store 小修；它直接影响从 Sub2API 进入 `/image`、`/canvas` 后是否还能保持正确账号身份和路由。
- 不要把 `session-probe` 当成纯前端调试 iframe；它已经直接决定切号、登出和余额同步是否正确。
- 不要把对象存储下载能力误判成“前端拿 object_url 直接下”；当前默认路径是站内鉴权 + presign / CDN TypeA 临时签名。
- 不要把素材库 collections 当成 `image-manager` 的孤立功能；它已经影响 `/image` 参考图选择和 `/canvas` 资产侧栏的默认工作流。
- 不要把“视频模型隐藏”误判成纯前端展示条件；它反映的是当前能力边界依赖 Sub2API 绑定这一真实产品约束。
- 不要把当前仓库默认理解成“继续做 `/canvas` 功能”或“继续打磨 image workspace UI”；最近更高优先级的是 bridge 配置、真实账号回跳、充值扣费、余额展示、团队空间闭环，以及 Pro Studio / 电商生产工作台交付。
- 不要把 Pro Studio 生产模式误判成单纯 UI 壳层；它已经牵涉 official 路由能力、batch 参数、结果序列化、素材归档和项目交付。
- 不要把 `ecommerce-suite` 的 summary composite 误判成单独的“导出按钮”；它现在依赖项目里的排版模式、参与图片、顺序和持久化配置，属于工作台默认状态的一部分。
- 不要把 Gemini 模型变更理解成纯命名调整；当前 preview 路由和 reference upload 已影响协议入口、前端 payload 和兼容验证基线。
- 仅看 README 和旧任务快照，容易漏掉独立用户版入口、Sub2API 钱包真源、团队共享额度 v1、per-user retention、continued edit、embedded session recovery、bound Sub2API key preservation、视频节点 fail-closed、`/canvas` 自研节点画布，以及 Pro Studio / `ecommerce-suite` 生产模式这些新默认约束。
