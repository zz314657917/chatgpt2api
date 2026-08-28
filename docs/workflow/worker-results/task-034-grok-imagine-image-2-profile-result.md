### DONE: task-034-grok-imagine-image-2-profile

## changed files

- `internal/util/json.go`、`internal/httpapi/sub2api.go`：将公共与上游模型统一为 `grok-imagine-image-2.0`，文生图和参考图统一发往 `images/generations`，实现 8000 字符提示词、`n=1..10`、14 种比例、1K/2K、条件性 Low/Medium、布尔 `nsfw_check` 与最多 3 张参考图的严格 payload 校验。
- `internal/httpapi/canvas.go` 及 Grok/Canvas 测试：删除旧 1.5 上游别名过滤，补齐 2.0 模型目录、endpoint、payload、默认值、非法参数和三张参考图覆盖。
- `web/src/lib/api.ts`、`image-parameters.ts`、`image-model-settings.ts` 及断言：新增 Grok 2.0 单模型 profile、14 种比例、1K/2K、Low/Medium、三张参考图和 `nsfw_check` 状态规范化。
- 图片页、Canvas、电商套图和 Image Arena：统一传播 Grok 2.0 参数；参考图模式隐藏并清除质量，旧 4K/21:9/high 状态提交前收敛，Canvas 未手改比例的参考图模式省略比例。
- `web/src/app/image/page.tsx`：将 Gemini Flash 专属搜索参数严格限制在 Gemini 模型，防止 Grok 请求混入 `google_search` / `google_image_search`。
- workflow 文档：记录 Task-034 contract、两次 allowlist amendment、实现证据与 QA 结论。

## commands run

- `go test ./internal/httpapi -run "Test.*(Grok|CanvasImageModel)" -count=1`
- `go test ./internal/httpapi ./internal/util -count=1`
- `go test ./...`
- `cd web; npm.cmd run lint`
- `cd web; npm.cmd run build`
- Task-034 限定路径 `git diff --check -- ...`
- `rg -n "grok-imagine-1\.5|grok-imagine-1-5|1\.5-apimart|1\.5-edit" internal web/src`
- 隔离浏览器与本地请求记录代理验收；未连接真实 APIMart。

## test output

- PASS：Grok/Canvas 定向 Go 测试（`ok chatgpt2api/internal/httpapi 0.891s`）。
- PASS：相关包 Go 测试（`httpapi 17.443s`、`util 0.031s`）。
- PASS：`go test ./...`，全部列出的包通过。
- PASS：`npm.cmd run lint`，0 error；保留 `beads/upstream/workspace-canvas.tsx` 既有 2 条 hooks warning。
- PASS：`npm.cmd run build`，TypeScript、Vite 构建与 63 个静态资产预压缩完成。
- PASS：限定路径 `git diff --check` 无空白错误；仅有 Git 的既有 LF/CRLF 提示。
- PASS：`internal` 与 `web/src` 中无 Grok 1.5 运行时代码残留。

## browser evidence

- 模型目录显示 `grok-imagine-image-2.0`；比例菜单为 Auto 加 13 个文档比例，不含 21:9、像素尺寸或自定义宽高；分辨率仅 1K/2K，质量仅 Low/Medium。
- 无参考图请求体确认 `model=grok-imagine-image-2.0`、`size=16:9`、`image_resolution=2k`、`quality=low`、`nsfw_check=true`、`n=1`，且无 Gemini 搜索字段。
- 三张本地参考图可同时加入；第 4 张被“当前图片模型最多支持 3 张参考图”拦截。参考图模式质量控件为 0。
- 三参考图本地任务请求含 3 个 `reference_image_ids`、`model=grok-imagine-image-2.0`、`image_resolution=1080p`、`nsfw_check=true`，不含 `quality` 或 Gemini 搜索字段。

## risks

- 隔离账号没有可用图片额度，三参考图请求在本地任务链路终止；未使用真实 APIMart Token，不能证明真实付费生成、上游审核、最终图片或计费结果。
- 本轮未构建运行服务镜像、未更新 Docker、未部署。

## contract compliance

- Task-034 业务 hunk 均位于 contract 与两次 amendment 的 Allowed Paths；工作区其它 Task-025..031、拼豆和 Gemini 改动被保留且不纳入本 Task 裁决。
- 未修改 Sub2API 仓库、计费、鉴权、数据库、Docker、部署或生产配置。
- 未保留 1.5 alias、fallback、feature flag 或 `images/edits` 上游双路径。

## knowledge_candidates

- None。Task-034 的时效性供应商契约已保存在当前仓库 workflow 文档中，不提升为跨仓库长期规则。
