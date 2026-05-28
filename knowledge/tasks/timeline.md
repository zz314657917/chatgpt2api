# Project Timeline

## 2026-05-28 21:24 +08:00 - 8081 Sub2API Launch 容器配置修复

- 当前阶段：8081 本地 Docker 预览恢复 Sub2API/OpenWebUI 启动登录能力。
- 本段重点：定位到 `chatgpt2api` 容器未加载 `.env`，导致 `/auth/sub2api/launch` 返回启动兑换未配置；已有本地会话仍可直接进 `/canvas`，但新普通用户从 Sub2API 跳转会失败。
- 已完成：用同一镜像 `chatgpt2api:local`、同一数据卷 `chatgpt2api-data`、同一端口 `127.0.0.1:8081->80` 重建容器，补上 `--env-file F:/java/chatgpt2api/.env` 和 `/app/.env:ro` 挂载。
- 验证记录：`docker inspect chatgpt2api` 可见 `CHATGPT2API_SUB2API_REDEEM_URL/SECRET/LAUNCH_URL/GATEWAY_BASE_URL`；`http://127.0.0.1:8081/health` 返回 200；容器内访问 `http://host.docker.internal:8080/health` 返回 `{"status":"ok"}`；假 token 调 `/auth/sub2api/launch` 已变为上游 `401 launch token is invalid or expired`，不再是未配置错误。
- 下一步：如后续用 Compose 或脚本重建 8081，必须保留 `.env` 注入和 `/app/.env` 挂载，否则 Sub2API launch 会再次失效。

## 2026-05-27 04:52 +08:00 - Canvas 登录链路与图片编辑器布局归档

- 当前阶段：`/canvas` Sprint 3 后续打磨中，8081 本地 Docker 预览已恢复 healthy。
- 本段重点：修复 Sub2API launch/redeem 容器网络配置；调整图片编辑器为顶部模式切换、左侧当前工具参数；拆分过大的图片编辑器文件。
- 已完成：`.env` 中 `CHATGPT2API_SUB2API_REDEEM_URL` 和 `CHATGPT2API_SUB2API_GATEWAY_BASE_URL` 从容器内不可用的 `127.0.0.1:8080` 改为 `host.docker.internal:8080`；`SmartCanvasImageEditor` 拆出 config、types、utils、fields、tool-panel；8081 容器热替换 Linux embed 二进制。
- 关键决策：`裁剪/扩图/遮罩/画笔/宫格切分` 作为编辑模式放顶部，左侧只承载当前模式参数和子工具；`细节增强`、`图片编辑` 当前与节点内能力重复，后续更适合作为节点内或右键快捷动作，真正接专用模型后再提升入口。
- 验证记录：`cd web && npm.cmd run build` PASS；`cd web && npm.cmd run lint` PASS；`git diff --check` PASS；`http://127.0.0.1:8081/health` 返回 200；容器内访问 `http://host.docker.internal:8080/health` 返回 ok。
- 遗留问题：图片编辑器新布局建议真实登录态下再手动打开图片编辑确认；Docker 镜像构建仍受 DockerHub 拉取 `docker/dockerfile:1.7` 超时影响，本轮采用 Linux 二进制热替换。
- 下一步：收敛 `细节增强/图片编辑/角度控制` 的入口层级，优先把重复快捷功能下沉到节点内或右键菜单；继续评估错误详情、图库筛选和专用模型适配。

## 2026-05-27 02:18 +08:00 - Canvas Sprint 2 三工具迁移关闭

- 当前阶段：`docs/workflow/status.md` 已更新为 `canvas-sprint-002` done，Sprint 2 关闭。
- 本段重点：把 Infinite Canvas 参考中的 `细节增强`、`图片编辑`、`角度控制` 迁移到 `/canvas` 左侧工具栏，继续复用现有 `creation-tasks/image-edits` 和图片库链路，不新增后端接口。
- 已完成：三工具单图选中启用校验、tooltip 禁用原因、细节增强默认 prompt、角度控制三滑杆弹窗、image edit task 提交、结果节点轮询回填、来源节点连线、图片编辑器产物相邻节点和来源连线。
- 多智能体结果：并行 worker 产出 `canvas-history.ts`、`canvas-error-details.ts`、`canvas-asset-filters.ts` 三个未接入 UI 的 Sprint 3 候选模块；主控 Codex 已关闭这些 sub-agent。
- 验证记录：`cd web && npm.cmd run build`、`cd web && npm.cmd run lint`、`go test ./...`、`git diff --check` 均通过；build 仅有既有 npm config 与 Vite chunk size 警告。
- 遗留问题：本轮自动化浏览器点选验收受登录态限制，真实登录环境仍建议手动打开 `/canvas` 点击三工具确认；`细节增强` 和 `角度控制` 仍是 prompt 化 image edit，不是专用模型。
- 下一步：进入 Sprint 3 Planner，优先从撤销/重做、错误详情、图库筛选或专用模型适配中选一个 contract。

## 2026-05-26 22:40 +08:00 - Canvas Sprint 1 验收关闭

- 当前阶段：`docs/workflow/status.md` 已从 `build` 推进到 `done`，`canvas-sprint-001` 关闭。
- 本段重点：完成 `/canvas` Sprint 1 的 P/G/E 验收闭环，核心范围是图片引用去重、图片库输入、连线输入、生成状态、Output 回填和基础画布交互稳定性。
- 已完成：命令验证通过；8081 Docker 已更新到嵌入式前端资源；用户在真实 Chrome 登录态下手测通过并反馈“测试没问题”。
- 关键决策：in-app browser 因登录态被重定向到 `/login` 的限制不再阻塞 Sprint 1，真实用户环境验收作为浏览器 gate 补充证据。
- 验证记录：`cd web && npm.cmd run lint`、`cd web && npm.cmd run build`、`go test ./...`、`git diff --check` 均通过；`/health` 返回 200。
- 下一步：进入 Sprint 2 Planner，优先讨论运行体验增强、错误详情、误删恢复/撤销或图片编辑增强，不直接跳过 contract。

## 2026-05-25 06:05 +08:00 - Canvas 工作台合并与图片策略收窄归档

## 2026-05-27 03:45 +08:00 - Canvas Sprint 3 左侧列表、LLM 节点与时间轴接入

- 当前阶段：`/canvas` P/G/E Sprint 3 已完成并记录为 PASS。
- 本段重点：收敛画布 UI 重复入口，左侧改为可收缩画布列表，顶部和右键菜单统一创建节点，右侧图片库只保留素材；新增 LLM 节点和撤销/重做时间轴。
- 已完成：`SmartCanvasLeftRail` 支持画布切换、新建、刷新、重命名、二次确认删除和折叠状态持久化；`SmartCanvasAssetSidebar` 移除画布列表；`llm` 节点接入类型、normalize、UI、连线和 `createChatCompletionTask` 运行链路；API生成读取上游 LLM 输出；`canvas-history.ts` 接入 controller、顶部按钮、快捷键和最近操作面板。
- 关键决策：LLM 节点首版只做单次文本处理，不做多轮聊天；时间轴首版只做当前浏览器会话内存历史，不做服务端版本历史。
- 验证记录：`cd web && npm.cmd run build` PASS；`cd web && npm.cmd run lint` PASS；`go test ./...` PASS。
- 遗留问题：仍建议用真实登录态浏览器验证 LLM 节点实际任务提交、撤销/重做操作手感和左侧折叠体验；历史采用整份画布快照，超大画布后续可优化为差量。

- 当前阶段：`codex/chatgpt2api-canvas` 已整理、提交、fast-forward 合并到 `main`，并推送到 `origin/main`。
- 本段重点：新增无限画布工作台，覆盖 canvas 存储、运行、节点执行、权限、路由、前端画布页和 API 客户端；同时把本地图片关键词策略从多类业务拦截收窄为仅拦截成人私密/色情与暴力血腥，解决 Minecraft 提示中“古修士破碎法器”误命中证件规则的问题。
- 已完成：提交 `ba1979a feat(canvas): add canvas workspace and narrow image policy` 与 `13a90b1 docs: update current task after canvas merge`；`main` 与 `origin/main` 已对齐到 `13a90b1`；`.playwright-cli/` 已加入 `.gitignore`，本地调试输出未提交。
- 关键决策：本地内容策略不再拦截证件、公章、API 中转、代理、涉政、明星/IP、换脸等宽泛关键词，减少误判；这些内容是否可生成交给上游策略或后续更高置信规则处理。
- 验证记录：`go test ./internal/service ./internal/httpapi ./internal/protocol` 通过；`cd web && npm run build` 通过，仅 Vite 大 chunk 提示；`cd web && npm run lint` 通过；`git push origin main` 成功。
- 遗留问题：上游 `upstream/main` 仍因权限限制无法推送；canvas 是首版工作台，后续建议用真实浏览器/本地服务做一次端到端操作验证，包括建画布、连线、运行文生图/图生图、取消运行与历史记录。
- 下一步：若继续推进该仓库，优先补一份项目内专题知识页，收口 Sub2API launch、leaf network login、image workspace、canvas workspace、对象存储和图片任务验证链路；暂不需要创建全局 skill。

## 2026-05-22 12:15 +08:00 - Current Task 补入 leaf network login 与 image policy 默认约束

- 当前阶段：知识快照继续从 5 月 18 日的 Sub2API image workspace / white-label 主线，推进到最近两天已经稳定的登录入口与策略约束事实。
- 本段重点：根据 2026-05-21 的 `feat(image): harden image workspace policies` 和 2026-05-22 的 `feat(auth): add leaf network launch login`，更新 `knowledge/05-current-focus.md` 与 `knowledge/tasks/current-task.md`。
- 已完成：把当前稳定心智从“双主线”改为“Sub2API image workspace + white-label profile experience + leaf network 登录承接”，并明确 image workspace policies、per-user retention、continued edits 与登录页承接能力已进入默认主线。
- 关键决策：不把最近登录入口和策略收紧继续留在提交历史里隐含表达；后续续做登录页、图片策略、Sub2API 跳转和对象存储链路时，应直接从当前知识入口读到这些默认约束。
- 验证记录：本轮只更新知识文件，依据最近提交主题和改动文件名收口；未新增构建、测试或本地服务验证。
- 遗留问题：仓库仍缺一份更稳定的“Sub2API / leaf network 登录与 image workspace 最小闭环验证”专题页，后续若继续推进登录入口或图片策略治理，建议单独沉淀。
- 下一步：如继续维护知识库，优先补“launch/redeem / leaf network login / `/image` 工作台 / 对象存储与本地图片访问”专题页。

## 2026-05-18 00:20 +08:00 - Current Task 从白标 UI 收尾推进到 Sub2API 工作台主线

- 当前阶段：知识快照从上一轮品牌改名/外链移除/个人中心收缩，推进到最近真实提交主线。
- 本段重点：根据 2026-05-16 的 `feat: white label profile experience` 和 `feat: integrate sub2api image workspace`，更新 `knowledge/tasks/current-task.md`，明确本仓库当前默认心智应是“白标化的独立生图工作台服务”。
- 已完成：把当前任务页重写为 Sub2API image workspace + white-label profile experience 语境，并补入最近实际触达的后端、前端、存储和 auth 路径。
- 关键决策：保留白标 UI 调整的阶段性事实在时间轴中，但不再让其占据当前任务快照主体；当前任务页应优先服务最近继续开发的人。
- 验证记录：本轮只更新知识文件，依据最近提交主题和改动文件名收口；未新增构建、测试或本地服务验证。
- 遗留问题：仓库仍缺一份更稳定的 Sub2API 集成专题页，后续若继续推进 launch/redeem、对象存储或图片任务治理，建议单独沉淀。
- 下一步：如继续维护知识库，优先补“Sub2API 集成验证入口 / 独立生图工作台默认链路”专题页。

## 2026-05-16 21:10 +08:00 - Hide Profile Local Account Panels

- 当前阶段：完成 chatgpt2api 个人中心面向 Sub2API 跳转用户的界面收敛。
- 本段重点：隐藏个人中心的“接口密钥”“本地计费”“登录密码”模块，避免用户误以为需要在 chatgpt2api 再维护本地 API Key、余额或登录密码。
- 已完成：更新 `web/src/app/profile/page.tsx`，删除个人页 API Key 管理 UI、本地计费展示、登录密码修改卡片及其前端状态/调用；保留用户概览和账号资料昵称保存。
- 关键决策：只隐藏 UI，不删除后端密钥/密码相关接口，避免影响管理员能力或后续兼容。
- 验证记录：`corepack.cmd pnpm --dir web lint` 通过；`corepack.cmd pnpm --dir web build` 通过，仅有 Vite 大 chunk 提示；临时 8081 服务运行期间 `/health` 返回 200；构建包检查个人页相关隐藏文案不再存在。
- 遗留问题：浏览器插件可视确认超时；提交整理阶段已停止本地 8081 临时进程并清理临时 exe/log。
- 下一步：远端部署后刷新浏览器缓存，确认 `/profile` 只保留用户概览和账号资料。

## 2026-05-16 20:49 +08:00 - Refresh 8081 Preview Service

- 当前阶段：完成 `http://127.0.0.1:8081/image` 服务更新。
- 本段重点：确认 8081 不是 Docker 容器，而是本机 Go 二进制进程；重建前端资源与带 embed 的后端二进制并重启服务。
- 已完成：运行 `npm.cmd run build`；运行 `go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=0.0.0-dev" -o chatgpt2api-8081.exe ./internal`；停止旧 `internal.exe`；启动 `chatgpt2api-8081.exe`。
- 关键决策：未操作 Docker 容器，因为 `docker ps` 未显示 8081 相关容器，端口实际由本机进程监听。
- 验证记录：`http://127.0.0.1:8081/image` 返回 200 并引用 `/assets/index-C2xAVLwe.js`；`/api/app-meta` 返回 `落叶网络`；当前 JS bundle 不含 Telegram 或原 GitHub 仓库外链。
- 遗留问题：`chatgpt2api-8081.exe`、`chatgpt2api-8081.out.log`、`chatgpt2api-8081.err.log` 是本轮运行产物，当前服务需要它们；不应在服务运行时删除 exe。
- 下一步：如需容器化运行到 8081，需要单独调整 Docker/Compose 端口映射并构建镜像。

## 2026-05-16 20:42 +08:00 - Remove Public Links From Menus

- 当前阶段：完成 Telegram/GitHub 外链入口移除。
- 本段重点：删除账号菜单中的 Telegram/GitHub 两个外链按钮；同步删除登录页右上角同款外链按钮。
- 已完成：修改 `web/src/components/top-nav.tsx` 和 `web/src/app/login/page.tsx`，账号菜单仅保留“个人中心”和“退出登录”，登录页右上角仅保留公告和主题切换。
- 关键决策：只移除用户可见外链入口，不改内部更新仓库、项目包名、存储 key 或 README 链接。
- 验证记录：`npm.cmd run lint` 通过；`npm.cmd run build` 通过；源文件精确搜索 Telegram/GitHub 外链无匹配。
- 遗留问题：构建产物里仍可能有 GitHub 文本来自设置/更新相关页面，不属于本轮菜单外链。
- 下一步：如需完整白标化，再评估 README、版本更新仓库、登录页标题、图标和部署镜像名等范围。

## 2026-05-16 20:39 +08:00 - Brand Rename To 落叶网络

- 当前阶段：完成左上角品牌文字改名。
- 本段重点：将顶部导航原硬编码 `chatgpt2api` 改为读取应用元信息，并把默认 `app_title/project_name` 同步为 `落叶网络`。
- 已完成：修改 `web/src/components/top-nav.tsx`、`web/src/lib/app-meta.ts`、`internal/httpapi/app.go`、`web/src/app/settings/store.ts`。
- 关键决策：仅改展示品牌和默认元信息，不改内部存储 key、包名、更新仓库、GitHub 链接或 `logo-mark.svg` 图形本体。
- 验证记录：`npm.cmd run lint` 通过；`npm.cmd run build` 通过；`go test ./internal/httpapi` 通过；构建产物可搜索到 `落叶网络`。
- 遗留问题：浏览器插件预览连接超时，未完成截图级人工确认；如需更换图标形状，后续编辑 `web/public/logo-mark.svg`。
- 下一步：用户若确认只要文字改名，可结束；若要完整品牌化，再处理图标、登录页文案、README 和部署镜像/更新仓库等范围。

## 2026-05-16 20:22 +08:00 - Knowledge Base Initialization

- 当前阶段：初始化仓库级知识库、当前任务快照和时间轴。
- 本段重点：用户询问 SuperGrok 支持情况；本地搜索确认仓库没有 `SuperGrok`、`Grok` 或 `xAI` 相关实现；随后按用户要求生成知识库与时间轴。
- 已完成：创建 `knowledge/00-start-here.md`、`knowledge/tasks/current-task.md`、`knowledge/tasks/timeline.md`。
- 关键决策：把长期入口放在 `knowledge/00-start-here.md`，把当前会话快照放在 `knowledge/tasks/current-task.md`，把阶段历史放在 `knowledge/tasks/timeline.md`。
- 验证记录：执行 `rg -n "SuperGrok|Grok|xAI|grok|supergrok" .` 无匹配；检查仓库此前不存在 `knowledge/` 和 `docs/ai/`。
- 遗留问题：Grok 支持尚未实现；如要开发，需要先确认接入官方 xAI API 还是网页账号协议。
- 下一步：若继续开发 Grok 支持，先查官方 xAI API 当前文档并梳理后端 provider/模型列表/前端模型选择的改动范围。
