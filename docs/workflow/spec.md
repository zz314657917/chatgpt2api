---
repo: chatgpt2api
project_type: web
qa_mode: browser
last_updated: 2026-06-09
---

# Product Spec

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
