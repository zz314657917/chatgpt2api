### PASS: task-034-grok-imagine-image-2-profile

# QA Report

## Findings

- 未发现剩余明确问题或发布阻断项。
- 浏览器首轮验收发现 Grok 请求误带 Gemini Flash 的 `google_search=false` / `google_image_search=false`；已将 Gemini extra body 限定到 Gemini 模型，复测请求体不再包含这两个字段。
- 独立 diff 复核发现 Canvas 切换到 Grok 时会错误地把比例标记为“用户已修改”；已删除强制标记，保留参考图“原图”模式省略比例的既有语义，fresh 前端 build 通过。
- 工作区存在大量其它 Sprint 的既有未提交改动；本 QA 只裁决 Task-034 的批准 hunk，未回滚、格式化或吸收无关改动。

## Executed Checks

- `go test ./internal/httpapi -run "Test.*(Grok|CanvasImageModel)" -count=1` — PASS（0.891s）。
- `go test ./internal/httpapi ./internal/util -count=1` — PASS（17.443s / 0.031s）。
- `go test ./...` — PASS（全部列出的 Go 包通过）。
- `npm.cmd run lint` — PASS（0 error；拼豆工作台既有 2 条 hooks warning）。
- `npm.cmd run build` — PASS（TypeScript、Vite 与压缩步骤通过）。
- Task-034 限定路径 `git diff --check -- ...` — PASS；无空白错误。
- 1.5 残留扫描 — PASS；`internal` 与 `web/src` 无 `grok-imagine-1.5`、`grok-imagine-1-5`、`1.5-apimart` 或 `1.5-edit`。
- diff 精准性检查 — PASS；Grok 2.0 业务改动可追溯到模型替换、payload/校验、四个前端入口、断言或浏览器验收修复；共享文件内其它既有 hunk未纳入本结论。
- 隔离浏览器 mock — PASS：Auto + 13 个文档比例、1K/2K、Low/Medium、`nsfw_check`、参考图隐藏质量均符合契约；无参考图和三参考图请求体均无 Gemini 搜索字段。
- 三参考图浏览器验收 — PASS：3 张可加入并提交到本地任务 API，第 4 张被上限提示拦截；请求含 3 个 `reference_image_ids` 且无 `quality`。
- 隔离资源清理 — PASS：浏览器页已关闭，`127.0.0.1:18034` / `18035` 已停止监听，精确临时目录已移入回收站。

## Unverified Risks

- 未使用真实 APIMart Token；真实排队、内容审核、付费生成、图片产物和供应商计费均未验证。
- 隔离三参考图请求因测试账号无图片额度未触达真实上游；浏览器证据只证明本地 UI、上传、任务请求体和上限行为。
- 未构建或更新 Docker 镜像，未部署，未验证生产运行实例。

## Recommendation

- `可继续`：Task-034 本地实现与 mock 验收证据足以合并到当前源码工作流；如需宣称真实服务可用，下一门禁应是使用独立测试额度执行一次真实 APIMart 文生图与三参考图 smoke。

## Contract Compliance

- `PASS`。未触碰 Sub2API 仓库、计费、鉴权、数据库、Docker、部署或生产配置；未保留 Grok 1.5 alias/fallback/双 endpoint。
- 本报告按 `review-and-verification` 的 Findings、Executed Checks、Unverified Risks、Recommendation 结构完成 evidence-first 复核。
