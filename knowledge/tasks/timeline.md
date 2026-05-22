# Project Timeline

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
