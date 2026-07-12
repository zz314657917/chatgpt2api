---
repo: chatgpt2api
project_type: web
qa_mode: browser
last_updated: 2026-07-11
---

# Product Spec

## 当前状态

- 当前 workflow 状态以 `docs/workflow/status.md` 为准：`phase=contract-approved`，当前 Sprint 为 `task-014-canvas-batch-layout`。
- `task-001` 到 `task-013` 已把落叶创艺独立用户版、Pro Studio、prompt split、bridge 计费元数据和 pending settlement retry 推成稳定背景层；当前默认续做不再是“继续补独立站入口”，而是继续收口 Canvas prompt-split fan-out 的布局、缩放和重复拆分语义。
- 2026-07-11 新增的结算约束也已进入当前规格背景：固定结算场景下，Studio Bridge / APIMart 图片账单仍需保留真实模型语义，不能把 `gpt-image-2` 错映射成泛化模型名。

## 一句话需求
- 将 `chatgpt2api` 改造成独立创作站“落叶创艺”：普通用户只走 Sub2API 注册、登录、充值和余额扣费，进入站点后直接使用创作台、无限画布、社媒运营和图片库，不再接触 API Key / Token / OpenAI-compatible / API 选择。

## 目标
- 普通用户未登录访问落叶创艺时，展示短暂跳转提示并跳转到 Sub2API 登录/注册；完成后自动回跳落叶创艺并建立本地会话。
- 充值、余额、使用记录、扣费真源统一在 Sub2API；落叶创艺只做创作体验和任务记录。
- 落叶创艺普通部署隐藏本地管理员登录入口，站点配置统一放到 Sub2API 管理后台。
- 管理员在 Sub2API 中配置落叶创艺应用，包括回跳域名、充值入口、默认聊天/生图/视频分组和内部通信密钥。
- 团队模式 v1 支持创建团队、创建者定向邀请、个人/团队空间切换；团队空间扣队长/团队共享额度，任务记录实际操作者。

## 非目标
- 不彻底删除 chatgpt2api 原管理员后台和维护能力，本轮只在普通部署中隐藏入口。
- 不让普通用户选择或绑定 Sub2API API Key。
- 不做企业级组织、审批流、部门层级、复杂成员权限或精细预算审批。
- 不改支付核心回调逻辑，除非 Sub2API 需要暴露充值入口字段。

## 技术方案
- Sub2API 增加外部创作站 bridge：登录回跳、一次性 launch token、余额/充值/使用记录内部接口、幂等 `reserve / commit / refund` 扣费接口。
- chatgpt2api 增加落叶创艺独立模式：使用 Sub2API launch token 换取本地 session；任务执行前向 Sub2API 预扣，成功确认，失败/取消退款。
- 普通用户 UI 隐藏 API 相关概念；右上角展示用户名、余额、充值按钮，下拉仅保留个人资料、使用记录、退出登录。
- 团队模式数据保存在 chatgpt2api：`team_id` 表示团队空间，`payer_user_id` 表示扣费用户，`actor_user_id` 表示实际操作者。

## Sprint 计划
- `task-001-sub2-studio-bridge`：Sub2API 外部创作站配置、登录回跳、余额/充值/使用记录、幂等扣费接口。
- `task-002-luoye-backend`：chatgpt2api 后端接入 Sub2API 会话/钱包/默认路由并加入团队 v1 服务。
- `task-003-luoye-frontend`：落叶创艺普通用户 UI、隐藏 API 概念、充值与团队管理界面。
- `task-004-qa-browser`：跨仓库命令验证和 Playwright 浏览器验收。

## 追加需求：Pro Studio / 生产模式 v1

### 一句话需求
- 在 Canvas 无限画布和 Ecommerce 电商套图工作台中新增“生产模式”，把 `gpt-image-2-official` 做成可生产使用的图像工作流，而不是单纯的高级参数面板。

### 目标
- Canvas 支持轻量生产模式：开启后锁定 `gpt-image-2-official`，用户先选用途和输出等级，再按需展开 official 高级设置，普通模式不受影响。
- Ecommerce 支持商品生产计划：商品主图、SKU 批量图、详情页竖图、电商横幅和场景图使用统一 Pro Studio 预设、校验和 payload 构造。
- 前端共享同一套 official capability、preset、payload、validation 和 batch split，不在 Canvas/Ecommerce 各自复制参数规则。
- 后端对 `professional_mode=true` 或 `pro_studio.enabled=true` 做强校验和模型锁定，直接 curl API 也不能绕过 official 约束。
- official 单任务按当前项目 gateway 约束最多 4 张；批量输出必须拆任务或返回明确错误，不能静默截断。
- 任务、历史记录、Canvas 节点和图片资产记录 Pro Studio metadata，便于后续资产筛选、团队用量和 analytics。

### 非目标
- 不重写 creation-task、image task、Sub2API bridge、素材库或计费系统。
- 不新增数据库 schema、生产配置、支付协议或团队限额体系。
- 不做 AI 自动判断用途、自动重写 prompt、模板市场、成本可视化大屏、A/B 测试或整套商品图导出。
- 不把普通模式变成 official 专用模式；不开启生产模式时保留现有 `gpt-image-2`、`gpt-image-2-official`、Nano Banana 等模型选择。

### 技术方案
- 前端新增 `web/src/lib/pro-studio/`，集中定义 `OFFICIAL_IMAGE_MODEL`、official size/resolution/quality/output format/background/moderation/limits、Pro Studio 状态类型、用途预设、payload builder、validation、batch split 和 quality tier 映射。
- 前端新增 `web/src/components/pro-studio/`，提供生产模式开关、用途预设、输出等级、高级 official 设置、批量预览和 badge 组件。
- 扩展现有 `web/src/lib/image-task-request.ts` / `web/src/lib/api.ts` 的任务提交参数，允许 Pro Studio payload 透传 `professional_mode`、`pro_studio` 和 `official_settings`，但保持旧调用签名兼容。
- Canvas 在图片生成节点数据上保存 `professional_mode`、`pro_studio`、`official_settings`；运行生成、图生图、多参考图时，生产模式统一走 Pro Studio payload。
- Ecommerce 在本地项目状态上保存生产模式设置和 batch plan；SKU 或批量输出拆成多个 `n<=4` creation task，并在生成前展示拆分预览。
- 后端新增 official/pro-studio normalize + validate 服务，复用现有 `sub2api.go` official gateway 能力，统一校验模型、尺寸、分辨率、质量、输出格式、压缩率、背景、moderation、数量、参考图和 mask。
- 扩展 image task public fields 与 image metadata，使 `professional_mode`、`pro_studio`、`official_settings` 能随任务和图片资产保存、返回和展示。

### 验收标准
- `professional_mode=true` 或 `pro_studio.enabled=true` 时，任务模型最终只能是 `gpt-image-2-official`。
- Canvas 和 Ecommerce 导入同一套 Pro Studio capability、preset、payload、validation 和 batch split 模块。
- 生产模式支持 `1k/2k/4k`、official 比例、`auto/low/medium/high`、`png/jpeg/webp`、JPEG/WebP compression、`background=auto|opaque`、`moderation=auto|low`、`n=1..4`、参考图最多 16 张。
- Canvas 生产模式可提交 1:1 4K high、16:9 4K high、图生图和多参考图任务，并在结果节点显示 Pro Studio badge。
- Ecommerce 生产模式可提交商品主图、横幅、详情页竖图、场景图和 SKU 批量任务；8/12 张 SKU 拆成 `4+4` / `4+4+4`。
- 后端拒绝非法 official 参数：非法 size/resolution/quality/output_format/compression/background/moderation、`n>4`、参考图超过 16、mask 无参考图。
- 历史记录、素材库详情或可复用字段、Canvas 节点能看到生产模式、intent、quality tier 和 official settings。
- `cd web && npm.cmd run lint`、`cd web && npm.cmd run build`、`go test ./...` 通过；浏览器 QA 覆盖 Canvas/Ecommerce 生产模式 smoke。

### Sprint 计划
- `task-008-pro-studio-v1`：Pro Studio 生产模式 v1，覆盖共享前端层、后端强校验、Canvas/Ecommerce 接入、metadata 和验证。

## 追加需求：Canvas AI 提示词拆分

### 一句话需求
- `/canvas` 的 AI 提示词节点可将用户文本拆成 `1..10` 条独立生图提示词；用户可选择仅展开为可编辑的图片生成节点，或直接为每条提示词创建一张图片任务。

### 目标
- 使用持久化 prompt-split 批次保存拆词任务、提示词、子任务状态和取消状态，避免浏览器关闭后丢失直接生成链路。
- 拆词任务只接受严格 JSON prompt 列表，数量、空项和重复项校验失败时不提交任何图片任务。
- 直接模式的每个子任务固定 `n=1`，独立沿用既有权限、内容策略、限流、预扣与 Sub2API `reserve / commit / refund`。
- Canvas 为每条提示词创建独立的图片生成节点和结果节点；刷新后可从 batch 恢复缺失节点且不重复。
- AI 提示词节点从现有大卡片收口为 mini 卡片，完整输入、拆分结果和任务详情移入弹窗。

### 非目标
- 不支持参考图、蒙版、图生图或视频模板的 prompt-split fan-out。
- 不改数据库 schema、部署配置、支付协议、Sub2API bridge 协议或已有图片任务 API。
- 不把一个文本拆分成多个 AI 提示词节点；拆词模型只执行一次，输出直接进入图片生成节点。

### 验收标准
- `split_count=1..10`，前端默认 `1`；大于 10 返回明确错误，不沿用旧图片任务的静默截断行为。
- 非直接模式不创建图片任务，仅创建对应数量的可编辑图片生成节点和结果节点。
- 直接模式为每条 prompt 创建独立 `n=1` 任务；单项失败保留兄弟任务，父 batch 归为 `partial_success`。
- AI 提示词节点默认尺寸约为 `330 x 260`，输入/输出长文本不会撑高节点或遮挡画布。
- 通过后端单测、前端 lint/build、全量 Go 测试和 Playwright Canvas smoke。

## 追加需求：Canvas 批量节点整理与缩放

### 一句话需求
- AI 提示词批量展开后以稳定的紧凑节点和无重叠网格呈现，并允许图片生成与 Output 节点持久化缩放；重复拆分前由用户选择保留或替换上一批。

### 目标
- 自动 fan-out 的图片生成节点默认紧凑，手动模板继续保持完整编辑态。
- 图片生成与 Output 节点支持类型化最小尺寸、最大尺寸和刷新恢复。
- 新批次按两列 pair 网格自动寻找空白区域，不覆盖模板、旧批次或现有节点。
- 重复拆分弹窗提供保留、替换和取消；替换只在新提示词可用后清理上一批。

### 非目标
- 不修改 prompt-split 后端 API、任务执行、计费、数据库或 Sub2API。
- 不把 fan-out 合并成单一批次节点，不自动删除用户未确认的旧结果。

### 验收标准
- 3/10 条 fan-out 的图片生成和 Output DOM 边界互不相交，长提示词不撑开紧凑节点。
- 节点紧凑/完整切换、缩放、保存和刷新恢复均不提交任务。
- 保留模式把新批次放入空白区域；替换模式在新批次成功可用后只移除目标旧批次。
- 普通模式、direct 模式、`n=1`、刷新补建和失败隔离保持不变。

### Sprint 计划
- `task-014-canvas-batch-layout`：紧凑 fan-out、碰撞规避、节点缩放与重复拆分选择。

## 追加需求：Canvas 批次控制与低缩放层级

### 一句话需求
- 在 prompt-split fan-out 已经无重叠、可缩放的基础上，提供批次级切换、定位、整理、删除和低缩放摘要，使 10 组节点仍可管理。

### 目标
- 画布级批次工具条汇总当前批次进度，并允许在历史批次间切换。
- 当前批次可整体定位和重新排布，不移动模板、来源 AI 节点或其他批次。
- 低缩放时用稳定摘要替代不可读的完整控件，放大后恢复原节点内容。
- 批次纯 UI 操作不提交任何 prompt-split 或图片任务。

### 非目标
- 不增加批量生成或批量取消任务。
- 不修改后端 API、任务编排、计费、数据库或 Sub2API。
- 不改变 Task-014 节点尺寸、视图模式和重复拆分语义。

### 验收标准
- 3/10 条批次和多批次场景均可切换、定位、整理与安全删除。
- 整理后当前批次节点互不交叠，并避开其他画布节点。
- zoom `<0.4` 时 fan-out 节点显示摘要，zoom 恢复后显示原内容，节点尺寸和持久化数据不变化。
- 所有批次 UI 操作不产生 prompt-split 或图片任务请求。

### Sprint 计划
- `task-015-canvas-batch-controls`：批次工具条、一键整理和低缩放 LOD。

## 追加需求：Canvas 顶部批次控制整合

### 一句话需求
- 将批次控制从画布内第二行浮层移到顶部节点按钮左侧，减少视觉断层并释放画布空间。

### 目标
- TopBar 与 Board 共享当前批次状态，顶部负责控制，画布负责节点高亮。
- 桌面宽度不足时压缩状态内容，不让控件覆盖或回落到画布中央。
- 保持 Task-015 全部批次操作与零任务副作用。

### 非目标
- 不修改批次排布、节点尺寸、生成语义或后端 API。
- 不新增节点持久化字段。

### Sprint 计划
- `task-016-canvas-topbar-batch-controls`：顶部工具栏批次控制整合与响应式验收。

## 追加需求：Studio Bridge 固定结算保留图片模型语义

### 一句话需求
- 当图片任务走 APIMart / Studio Bridge 的固定结算路径时，结算侧仍要保留真实图片模型语义，尤其是 `gpt-image-2`，不能在 settlement metadata 中被错误折叠。

### 目标
- 固定结算图片任务提交到 bridge 时，保留 `gpt-image-2` 等真实模型值，供 usage、账单解释和下游对账复用。
- 不改变已有金额、尺寸、张数、来源和 settlement retry 语义，只修正模型归因。
- 让图片计费排障默认同时看 `model + image_count + image_size + settlement state`，而不是只剩金额。

### 非目标
- 不重构 bridge 计费协议。
- 不修改图片金额计算公式。
- 不扩展新的支付、团队或 UI 产品面。

### 技术方案
- 在图片任务结算请求组装阶段保留真实图片模型字段，不再把固定结算场景统一覆写成宽泛模型名。
- 继续复用现有 `image_count / image_size / image_size_source / image_size_breakdown` metadata，不额外新增 settlement 字段。
- 用定向测试覆盖 `gpt-image-2` 固定结算场景，避免后续 settlement recovery 或模型映射改动把这一层回退。

### 验收标准
- 固定结算图片任务进入 bridge 时，`gpt-image-2` 仍以 `gpt-image-2` 传递，而不是被改成其他模型名。
- 现有金额、尺寸、张数和 retry 语义不回退。
- 定向后端测试通过，并有 workflow task / qa 记录可追溯。
