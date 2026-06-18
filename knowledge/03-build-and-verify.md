---
title: Build And Verify
type: build
repo: chatgpt2api
last_verified: 2026-06-18
---

# 构建与验证

## 常用命令

前端构建：

```bash
cd web && npm run build
```

前端 lint：

```bash
cd web && npm run lint
```

后端测试：

```bash
go test ./...
```

带 embed 的本地二进制构建：

```bash
go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=1.0.0" -o chatgpt2api ./internal
```

本地运行：

```bash
CHATGPT2API_ADMIN_PASSWORD=change_me_please ./chatgpt2api
```

## 当前推荐验证组合

图片工作台前端、拖拽回编辑器、继续编辑、draft 保留类修改：

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. 如涉及后端协议或任务状态，再补 `go test ./...`
4. `git diff --check`

Sub2API launch/redeem、登录态桥接、图片任务路由或对象存储类修改：

1. `go test ./...`
2. `cd web && npm run build`
3. `git diff --check`
4. 如本地预览环境可用，再补 `http://127.0.0.1:8081/image`、`/canvas` 或对应嵌入入口的最小人工回读

配置限制、保留上限、策略开关类修改：

1. 先补对应 Go 测试
2. `go test ./...`
3. `cd web && npm run build`
4. `git diff --check`

`/canvas` 节点画布、保存/轮询、节点交互、视频节点或创作流类修改：

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `go test ./...`
4. `git diff --check`
5. 如本地预览环境可用，按 `knowledge/07-canvas-manual-checklist.md` 至少补 `/canvas` 的最小人工或浏览器回读

`/image` 分辨率预设、图片参数共享配置、Sub2API 图片 payload 规范类修改：

1. `go test ./...`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. `git diff --check`
5. 如本地预览环境可用，至少补 `/image` 的最小页面回读，并确认分辨率/格式/压缩参数未回退

落叶创艺独立用户版、Sub2API bridge、充值/余额、团队空间或生产联调类修改：

1. `go test ./...`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. `git diff --check`
5. 如本地预览环境可用，至少补一次浏览器最小闭环：匿名访问 `/image` 或 `/canvas` -> 跳转登录 -> Sub2API launch/redeem -> 回到创作页 -> 余额/充值入口可见

独立用户版、Sub2API bridge、充值/余额、团队空间或落叶创艺生产联调类修改：

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `go test ./...`
4. `git diff --check`
5. 如本地预览或容器环境可用，至少补一次真实或 mock 的 `Sub2API 登录/回跳 -> /image 或 /canvas -> 余额展示 -> 创作扣费/失败退款` 最小闭环回读

对象存储私有读写、`/api/images/download-url`、CDN TypeA 签名下载或素材库 collections 类修改：

1. `go test ./internal/imagestore ./internal/service ./internal/protocol ./internal/httpapi`
2. `go test ./...`
3. `cd web && npm run lint`
4. `cd web && npm run build`
5. `git diff --check`
6. 如本地预览或容器环境可用，至少补一次真实浏览器回读：
   - 下载个人、团队、公共图片各一次
   - 确认 `/api/images/download-url` 返回短期签名 URL
   - 确认 `/image-manager`、`/image`、`/canvas` 可按全部 / 未归类 / 素材集筛选

Pro Studio、`ecommerce-suite` 生产模式、ZIP 打包交付、text assets 或官方生图能力类修改：

1. `go test ./internal/service -run "Test(ImageServiceImageDetailReturnsProStudioMetadata|ImageTaskServicePreservesProStudioMetadata|NormalizeProStudioRequest|ValidateProStudioRequest)" -count=1`
2. `go test ./internal/httpapi -run "TestCreationTaskProStudio" -count=1`
3. `go test ./internal/service ./internal/httpapi -count=1`
4. `cd web && npm run lint`
5. `cd web && npm run build`
6. `go test ./...`
7. `git diff --check`
8. 如本地预览或容器环境可用，至少补一次浏览器 smoke：
   - `/canvas` 普通模式与生产模式都能打开
   - `/ecommerce-suite` 普通项目和生产模式都能切换
   - 商品主图/横幅/详情页/SKU 批量图配置可见
   - 如触达交付链路，再补 ZIP 下载、text asset 落库和项目素材集归档

`ecommerce-suite` 排版编排、summary composite、拼图导出或结果顺序类修改：

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `go test ./...`
4. `git diff --check`
5. 如本地预览或容器环境可用，至少补一次 `/ecommerce-suite` 浏览器 smoke：
   - 已完成图片能进入“排版与合成”
   - 切换 `auto-grid` / `vertical` / `horizontal` / `two-column` 至少两种模式
   - 勾选/取消参与图片后，参与数量和实时预览同步变化
   - 上下移动图片后，预览顺序同步变化
   - 重新打开同一项目时，顺序和筛选仍保留
   - “下载拼图”与“生成 AI 合成图”都基于当前排版，而不是旧默认顺序

Gemini 图片模型路由、preview 切换或 reference upload 类修改：

1. `go test ./internal/httpapi ./internal/service ./internal/util -count=1`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. `go test ./...`
5. `git diff --check`
6. 如本地预览环境可用，至少补 `/image` 或生产工作台最小回读，确认 Gemini 模型仍能提交 reference inputs

## 当前稳定验证心智

- 当前 image workspace 主线至少应覆盖：
  - 创建聊天时保留 draft
  - 结果可继续编辑
  - 本地结果 URL 可用于 continued edits
  - per-user image retention cap 生效
  - image workspace policies hardening 不破坏已有主流程
  - 从 Sub2API launch 进入后，已绑定 API key 不会在 session 初始化或刷新后丢失
  - embedded mode 下 stale token / store 失效后，仍能通过 cookie 恢复认证态
- 当前独立用户版主线至少应覆盖：
  - 未登录访问 `/image`、`/canvas`、`/social`、`/image-manager`、`/profile` 会先进入 `/login`，再由登录页跳 Sub2API
  - 登录回跳后直接进入创作台，而不是要求用户额外理解 API Key、Token 或 OpenAI-compatible 入口
  - 顶部余额和充值入口优先读取 Sub2API 钱包摘要，余额显示格式不退化
  - 普通用户 UI 不暴露本地管理员、API 绑定、限制 API、API Key、Token 或 API 选择入口
  - 团队创建、加入、切换和团队扣费记录至少保持最小可用闭环
- 当前 `/canvas` 主线至少应覆盖：
  - 页面能正常打开并保留全局顶部导航
  - 默认节点或空白画布加载符合预期
  - Prompt / image / image_generation / result 节点能正常交互
  - 视频生成节点能按当前绑定状态正确显示或隐藏
  - 生成节点提交后 queued/running 状态、轮询恢复和 Output 回填不退化
  - 自动保存不会用旧请求覆盖新编辑
- 当前 `/image` / 参数共享主线至少应覆盖：
  - composer 分辨率预设能正常展示与切换
  - `auto` 不会误作为 `image_resolution` 提交
  - 像素图标尺寸不会叠加分辨率预设
  - `1080p -> 1k`、`output_format`、`output_compression` 的前后端归一规则不退化
- 当前落叶创艺独立用户版主线至少应覆盖：
  - 匿名访问 `/image`、`/canvas`、`/social`、`/image-manager`、`/profile` 时，先进入 `/login`，再由登录页跳 Sub2API
  - 登录回跳后进入创作台，且不会暴露 API Key、Token、OpenAI-compatible、API 选择等普通用户不该看到的入口
  - 顶部余额和充值入口优先读取 Sub2API 钱包摘要，并正确展示 `cny_milli` 金额
  - 创作任务的预扣、确认、退款链路不因独立用户版 UI 或 bridge 接口改动而退化
  - 团队空间最小闭环至少保留 `team_id`、`payer_user_id`、`actor_user_id` 这组真实生产语义
  - 切换或退出 Sub2 登录态后，隐藏 iframe 探针和本地 `/auth/logout` 清理能把落叶会话带回正确用户，不继续沿用旧缓存
  - `session-probe` iframe 只加载 Sub2API `/studio-bridge/session-probe`，而不是退回根路径或被 `frame-ancestors` 拦截
- 当前对象存储 / 下载主线至少应覆盖：
  - 前端展示不暴露原始 `object_key/object_url/storage_backend`
  - 用户下载走 `/api/images/download-url` 鉴权，而不是后端直转大文件
  - 如启用腾讯云 CDN TypeA，下载链接包含 `sign` 且会按 TTL 失效
  - 私有 bucket 下，直接访问原始对象地址不能绕过站内权限
- 当前素材库主线至少应覆盖：
  - `/image-manager`、`/image`、`/canvas` 都能按素材集筛选
  - `__unclassified__` 未归类筛选可用
  - 公共图库保持只读
  - 团队素材集只对 owner / manager 可写
  - 一张图只能属于一个素材集
- 当前 Pro Studio / 电商生产交付主线至少应覆盖：
  - `/canvas` 与 `/ecommerce-suite` 的生产模式切换正常
  - `gpt-image-2-official` 锁模、official size、高级 official 设置与 batch 预览不退化
  - SKU `8/12` 张拆分预览仍为 `4+4` / `4+4+4`
  - ZIP 打包、text asset 保存和项目素材集归档不与既有 creation-task/素材库链路脱节
  - `ecommerce-suite` 的排版模式、参与图片选择、顺序调整和实时预览保持一致
  - 重新进入项目后，summary layout 的持久化配置不丢失
  - “下载拼图”与“生成 AI 合成图”继续读取当前排版，而不是回退到固定顺序
- 当前 Gemini 图片能力主线至少应覆盖：
  - Gemini 图片模型走 preview 路由
  - reference uploads 仍可提交
  - 前后端 payload 不回退到旧字段或旧入口
- 只跑前端 build 不足以证明 Sub2API launch/redeem 或图片任务链路正确；涉及登录态、任务、配置和存储时必须带后端测试。
- 只跑 `go test ./...` 也不足以证明 `/image` 工作台 UI 没被破坏；涉及编辑器、拖拽和展示流时应至少补前端 build。
- 只跑命令行构建也不足以证明 `/canvas` 交互没退化；涉及节点拖拽、连线、画布缩放、自动保存和运行状态时，应至少补浏览器侧最小回读。
- 只验证“能打开登录页”不足以证明嵌入链路正常；涉及 embedded session、Sub2API key 绑定或 launch/redeem 时，至少要确认用户不是被错误打回匿名态，且绑定 key 仍保持。
- 只验证“视频节点能看到”也不足以证明能力边界正确；还要确认无 Sub2API 绑定时它会 fail-closed 隐藏，而不是留给运行时报错。
- 只跑仓库内单边测试也不足以证明独立用户版桥接正常；涉及落叶创艺生产联调时，至少要确认 Sub2API 与 chatgpt2api 两边配置、回跳和扣费语义是一致的。
- 只跑单个工作台 smoke 也不足以证明生产交付链路正常；涉及 Pro Studio、`ecommerce-suite` 或 Gemini reference upload 时，至少要确认 creation-task 元数据、素材归档和前端工作台展示没有脱节。
- 只确认“能导出拼图”也不足以证明 `ecommerce-suite` 排版链路正常；还要确认参与图片选择、顺序调整、项目重开后的持久化，以及 AI 合成入口读取的是当前排版状态。

## 当前验证缺口

- 仓库目前缺少一份更细的“Sub2API image workspace 最小人工闭环”记录，尤其是 launch -> `/image` -> continued edit 的真实页面验证入口。
- `/canvas` 最小人工闭环已整理到 `knowledge/07-canvas-manual-checklist.md`，覆盖建画布、拖入图片、节点运行、Output 回填、自动保存和重新打开恢复。
- 当前知识库已能指向命令，但对“哪些改动必须同时验证前后端”之前表达不够稳定，后续应继续按 `/image`、`/canvas`、登录态桥接、对象存储、策略开关这些场景细化。
- 对 embedded session recovery / bound key preservation 这类修复，知识库目前还缺一份更细的最小人工检查清单，例如“从 launch 进入后刷新页面、模拟前端 token 失效、确认 cookie 恢复后仍保留已绑定 key”。
- 对视频节点与 composer 分辨率预设这类 6 月初新增主线，仓库还缺更细的最小人工检查清单，例如“无绑定时视频节点隐藏、有绑定时可见；`/image` 里切换预设后 payload 不回退到旧字段”。
- 对独立用户版 / Studio Bridge / 团队空间这条 2026-06-09 新主线，仓库还缺更细的生产联调 checklist，例如“真实域名、launch URL、recharge URL、internal secret、默认分组、余额显示、预扣/确认/退款、团队 payer/actor 记录”的统一回读入口。
- 对 2026-06-10~2026-06-11 新进入默认面的对象存储私有下载、CDN TypeA 签名和素材库 collections，目前仍缺一份更细的专题入口；优先读 `knowledge/08-luoye-independent-mode.md`。
- 对 2026-06-16 新进入默认面的 Pro Studio / 电商生产交付，仓库还缺更细的最小人工 checklist，例如“生产模式切换、official 设置、SKU 拆分、ZIP 下载、text asset 保存、图片归档项目素材集”。
- 对 2026-06-18 新进入默认面的 `ecommerce-suite` 排版编排，仓库还缺更细的最小人工 checklist，例如“排版模式切换、参与图片勾选、上下调整顺序、项目重开后配置保持、拼图导出和 AI 合成读取当前顺序”。
