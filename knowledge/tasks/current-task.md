# Current Task

## 背景

用户询问当前项目是否支持 SuperGrok，随后要求生成时间轴和知识库。之后用户要求把左上角 logo 旁的品牌名从 `chatgpt2api` 改成 `落叶网络`，移除账号菜单/登录页 Telegram/GitHub 外链，并隐藏个人中心中不需要暴露给 Sub2API 跳转用户的本地账号能力。

## 当前目标

将前端左上角品牌名和默认应用元信息改为 `落叶网络`，移除右上角账号菜单外链，隐藏个人中心的接口密钥、本地计费和登录密码模块，并保留已生成的仓库知识库入口。

## 本次已完成

- 已读取仓库 `AGENTS.md`，确认项目结构、命令、jshook 研究目录和安全约束。
- 已检查仓库中不存在既有 `knowledge/` 或 `docs/ai/` 目录。
- 已搜索 `SuperGrok`、`Grok`、`xAI`、`grok`、`supergrok`，未发现相关实现或配置入口。
- 已确认当前文档/前端模型列表主要围绕 `gpt-5*`、`gpt-image-2`、`codex-gpt-image-2`、`auto`。
- 已创建项目知识入口和任务记录文件。
- 已将顶部导航硬编码品牌改为读取 `useAppMeta()`，默认回退为 `落叶网络`。
- 已将前端默认 `app_title/project_name`、后端 `/api/app-meta` 返回值、设置页保存登录页图片后的元信息广播同步为 `落叶网络`。
- 已移除账号菜单中的 Telegram/GitHub 外链入口。
- 已同步移除登录页右上角相同的 Telegram/GitHub 外链入口，保留公告与主题切换。
- 已隐藏个人中心的“接口密钥”“本地计费”“登录密码”模块，仅保留用户概览和账号资料。
- 已将 `http://127.0.0.1:8081/image` 对应服务更新为最新构建用于本地验证。
- 已在提交整理前停止 8081 临时预览进程，并清理 `chatgpt2api-8081.exe` 与日志产物。

## 已确认事实

- 当前项目不支持 SuperGrok/Grok/xAI。
- 当前项目主要封装 ChatGPT 官网账号能力，并提供 OpenAI-compatible 接口。
- 如果未来要支持 Grok，需要先确定接入方式：xAI 官方 API 或 Grok/SuperGrok 网页账号协议；这属于新增集成。
- 当前默认展示品牌为 `落叶网络`，但内部存储 key、包名、更新仓库和 GitHub 链接仍保留原项目标识。
- `web/src/app/profile/page.tsx` 已按用户要求移除个人页接口密钥、本地计费和登录密码 UI；相关后端接口仍保留，避免扩大改动范围。
- 构建产物中仍可能出现 GitHub 字样，来源包括设置/版本更新等页面，不代表账号菜单外链仍存在。
- 提交整理阶段已停止本地 8081 临时进程；如果还要本地预览，需要重新启动服务。

## 待验证点

- 若后续决定实现 Grok 支持，需要联网查证 xAI 官方 API 当前文档和模型能力。
- 若后续决定逆向 Grok/SuperGrok 网页能力，需要重新确认合法性、账号风险、协议行为和安全边界。
- 如果要进一步更换图标本体，需要替换或重绘 `web/public/logo-mark.svg`。

## 当前结论

知识库和时间轴已初始化。左上角品牌名已改为走应用元信息，默认显示 `落叶网络`。账号菜单和登录页右上角的 Telegram/GitHub 外链已移除。个人中心已隐藏接口密钥、本地计费和登录密码模块。SuperGrok 结论来自本地仓库搜索和现有文档检查。

## 下一步

- 如果用户只需要品牌文字改名，本任务可结束。
- 如果用户还要换图标图形，编辑 `web/public/logo-mark.svg` 并重新跑 `npm.cmd run build`。
- 如果用户要实现 Grok 支持，先明确接入目标为 xAI 官方 API 还是 SuperGrok 网页账号。
- 如果用户只想移除账号菜单外链、但希望登录页保留外链，可恢复 `web/src/app/login/page.tsx` 中对应按钮。
- 如果需要本地预览 8081，重新构建并启动带 embed 的后端服务。

## 验证记录

- `rg -n "SuperGrok|Grok|xAI|grok|supergrok" .`：无匹配。
- `rg -n "func ModelList|ModelList\\(|Models|default_model|model list|gpt-5|gpt-4|claude|anthropic|gemini" internal web/src/lib docs README.md`：确认模型列表和文档主要为 ChatGPT/OpenAI-compatible 场景。
- `git status --short`：创建知识库前工作区干净。
- `npm.cmd run lint`：通过，0 warnings/0 errors。
- `npm.cmd run build`：通过，生成 `internal/web/dist`。
- `go test ./internal/httpapi`：通过。
- 构建产物检查：`rg -n "落叶网络" internal/web/dist ...` 可命中新品牌。
- `rg -n "Telegram|GitHub|https://t\\.me|github\\.com/ZyphrZero/chatgpt2api|telegramUrl|githubUrl|<Send|<Github" web/src/components/top-nav.tsx web/src/app/login/page.tsx`：无匹配。
- `go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=0.0.0-dev" -o chatgpt2api-8081.exe ./internal`：通过。
- 已停止旧的 `go run` 临时 `internal.exe` 8081 进程，并启动 `chatgpt2api-8081.exe`。
- `Invoke-WebRequest http://127.0.0.1:8081/image`：HTTP 200，页面引用 `/assets/index-C2xAVLwe.js`。
- `Invoke-WebRequest http://127.0.0.1:8081/api/app-meta`：返回 `app_title/project_name` 为 `落叶网络`。
- 请求当前 JS bundle：包含 `落叶网络`，不包含 `Telegram` 或 `github.com/ZyphrZero/chatgpt2api`。
- 浏览器插件预览尝试超时；本地 Vite 预览进程已清理。
- `corepack.cmd pnpm --dir web lint`：通过。
- `corepack.cmd pnpm --dir web build`：通过，仅有 Vite 大 chunk 提示。
- `Invoke-WebRequest http://127.0.0.1:8081/health`：在临时服务运行期间返回 200。
- `/profile` 对应构建包检查：不包含 `接口密钥`、`登录密码`、`图片计费单位`、`外部登录账号不使用本地密码`；`本地计费` 仅来自管理员用户列表/设置页，不属于个人中心残留。
