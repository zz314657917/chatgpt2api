# Current Task

更新时间：2026-05-28 17:02 +08:00

## 背景

`/canvas` 已进入节点式图片创作画布方向，继续复用 `chatgpt2api` 现有图片库、`creation-tasks`、权限体系和 Sub2API 模型路由。本轮 Sprint 4 从项目整体收口图片多场景性能，而不是只优化 `/image-manager` 局部。

## 当前目标

Sprint 4 目标已完成：稳定当前 `/canvas` 未提交功能改动，并完成图片接口轻量化、中图预览、图片库按需详情读取和画布图片轻引用。本轮在此基础上补充 `/canvas` 组节点，用于把多张图片和多段文本作为一个可复用输入集合传给后续节点。

## 本次已完成

- 新增 Sprint 4 contract：`docs/workflow/sprint-04-contract.md`。
- `.gitignore` 加入 `.tmp/`，并清理临时构建产物。
- 后端新增独立中图目录 `data/image_previews` 和 `GET /image-previews/...jpg`，鉴权规则与缩略图一致。
- 中图采用懒生成缓存：最长边 1200px、JPEG quality 82、独立 cache version、源图 mtime cache-busting。
- 删除图片时同步删除原图、缩略图、中图、metadata、references 和对象存储文件。
- 存储治理统计扩展 `previews_bytes/previews_files`，总容量纳入中图；`thumbnails` 清理动作现在清理缩略图和中图缓存，UI 称为“预览缓存”。
- `/api/images` 列表项已轻量化，不返回 `url/object_url/object_key/storage_backend/prompt/reference_images/reference_image_urls` 等重字段。
- `/api/images/detail` 保留完整字段，继续作为原图 URL、对象存储元数据和可复用生成参数入口。
- 前端拆分 `ManagedImageSummary` 和 `ManagedImageDetail`；列表只读 summary，下载、复制原图地址、同款生成按需拉 detail。
- 修复 `fetchManagedImages()` 参数过滤，`scope=all` 会保留，筛选字段里的 `"all"` 才省略。
- `/image-manager` 卡片只用 `thumbnail_url`；lightbox 初始用 `preview_url`；高清/下载才拉 detail 原图。
- 详情缓存 key 改为 `${scope}:${path}`，避免个人图库和公开/全部图库串用完整元数据。
- 自动刷新只合并第一页新增/更新项，不再用第一页结果删除已滚动加载的旧页。
- `CanvasImageRef` 增加 `preview_url`；画布素材栏和拖入节点保存 `path + thumbnail_url + preview_url`。
- `canvasImageSource()` 仍可由 `path` 解析原图，图生图、编辑、裁剪提交不受列表移除 `url` 影响。
- `authenticated-image` 受保护路径加入 `/image-previews/`，删除图片时会同步失效缩略图和中图 blob cache。
- 修复 `loop -> API生成` 连续运行时，API 生成节点 prompt 被重复叠加的问题。
- 复核创作任务状态收尾逻辑：取消、超时、无输出失败、服务重启恢复均会收尾终态任务的 `output_statuses`，避免历史 queued/running 脏状态继续卡住“创作并发额度”。
- 新增回归测试覆盖：
  - 等待创作并发额度中的 queued 任务被取消后保持 `cancelled`，释放前序任务后不会重新获取额度继续运行。
  - 已经是 `success/error/cancelled` 的历史任务加载时会把 `output_statuses` 规范成终态，不保留 queued/running。
- 新增 `/canvas` `group` 节点：
  - 工具栏和节点菜单可创建“组”；多选图片、提示词、LLM、Output 节点后创建组会自动记录成员。
  - 手动连线到组时会同步维护 `group_item_ids`；删除节点或删除连线会清理组成员引用。
  - 参考 Infinite-Canvas 补齐空间容器交互：普通节点拖入组框时自动加入组，拖出组框时自动移除；多个组重叠时归入重叠面积最大的组。
  - 组可连接到 API生成、AI 提示词、循环和 Output；后续节点读取组时会展开组内图片和文本。
  - 拖动组会带成员一起移动，但选择状态仍以组节点为主，避免误删成员。
- 后端新增 `group` 节点类型白名单；保存画布和旧 `canvas-run` 执行路径都允许组节点存在，执行时保底把组的输入透传为输出。
- 新增管理员创作任务治理入口：
  - `GET /api/admin/creation-tasks/diagnostics` 返回任务总数、活动任务、queued/running 数、终态脏 `output_statuses` 数、当前并发占用等诊断数据。
  - `POST /api/admin/creation-tasks/diagnostics` 默认只修复终态任务里的 queued/running 脏 `output_statuses`。
  - `POST /api/admin/creation-tasks/diagnostics` 携带 `finalize_active=true` 时，会把当前 queued/running 任务收尾为 error，取消运行 handler，并触发计费结算。
  - `/settings` 管理员页面新增“创作任务治理”卡片，可刷新诊断、修复终态状态、确认后终止卡住任务。

## 已确认事实

- 当前不引入数据库；图片索引和元数据仍基于文件系统与 JSON。
- 列表接口只提供轻摘要；完整元数据和原图 URL 只能通过 detail 按需读取。
- 中图是服务端懒生成缓存，不在上传或列表请求中同步生成。
- 画布节点保存轻引用，不保存图片列表里的原图 URL。
- 组节点只保存成员节点 ID，不保存图片本体、原图 URL 或密钥；组节点行为是复用 Infinite-Canvas 的“聚合上下文”思路，不是复制其源码。
- `/image-previews/` 与 `/image-thumbnails/` 共享同一类源图权限判断：先从缓存路径反解源图，再按源图授权。
- `ImageTaskService` 当前已有 `recoverUnfinishedLocked()`、`CancelTask()`、超时和 no-output 收尾逻辑；本轮没有改业务逻辑，只补了防回归测试。
- 创作任务治理接口是管理员专用；普通用户即使有 `/api/creation-tasks` 权限，也不能访问 `/api/admin/creation-tasks/diagnostics`。

## 待验证点

- 分页滚动验收：本地当前只有 17 张图片，未触发下一页。后续准备 300+ 张图片后，验证 `/image-manager` 和 `/canvas` 素材栏滚动追加正常。
- 下载/高清原图验收：本轮未执行真实下载动作。后续在浏览器点击下载/高清查看，确认才请求 `/images/...` 或 detail 原图。
- 生产卡顿复核：上线前建议在正式同量级数据上对 `/api/images?page_size=50` 响应体和首屏 Network 原图请求数做一次对比。
- 组节点浏览器验收：本地 Vite 访问 `/canvas` 会被登录页拦截，本轮未完成登录态内创建、连线和运行的点击验收。

## 当前结论

Sprint 4 已通过本机实现验证，可以关闭。组节点已完成前后端类型、交互和基础保存校验；剩余风险主要是登录态内画布点击验收、大数据量浏览器滚动和下载动作的人工验收，不影响已实现的字段边界与前端类型约束。

## 下一步

- 关闭 Sprint 4 -> 验证：确认 `docs/workflow/status.md` 为 `done`，并由用户决定是否进入下一 Sprint。
- 组节点人工验收 -> 验证：登录后在 `/canvas` 多选两张图片创建组，或把图片节点拖入/拖出组框，连接到 API生成/AI 提示词/循环，确认图片和提示词上下文被展开。
- 大样本验收 -> 验证：准备 300+ 张图片，检查首屏只请求第一页和缩略图，滚动到底追加下一页。
- 生产前复核 -> 验证：DevTools Network 中首屏不出现大量 `/images/...` 原图请求，`/api/images?page_size=50` 响应体明显小于旧全量接口。

## 验证记录

- `go test ./internal/service ./internal/httpapi`：PASS。
- `go test ./internal/service -run "TestImageTaskService(CancelQueuedTaskWaitingForCreationUnit|NormalizesTerminalOutputStatusesOnLoad)$"`：PASS。
- `go test ./internal/service ./internal/httpapi -count=1`：PASS。第一次目标包测试中 `internal/httpapi` 的 `TestCanvasModelsUseSub2APIGatewayForBoundUser` 曾失败，单测复现 PASS，重新跑目标包 PASS，判断为测试间共享状态或偶发请求顺序问题，未改业务代码。
- `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- `cd web && npm.cmd run build`：PASS。
- `git diff --check`：PASS，仅 Windows CRLF 提示。
- Browser 打开 `http://127.0.0.1:8081/image-manager`：PASS。
- 8081 管理员“全部”视图可见本地 17 张图片；卡片 `data-authenticated-image-cache-key` 为 `/image-thumbnails/...`；打开预览后新增 `/image-previews/...`。
- 组节点验证：`cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- 组节点验证：`cd web && npm.cmd run build`：PASS。
- 组节点验证：`go test ./internal/service -run Canvas`：PASS。
- 组节点验证：`git diff --check -- web/src/app/canvas/types.ts web/src/app/canvas/canvas-utils.ts web/src/app/canvas/use-smart-canvas-controller.ts web/src/app/canvas/canvas-node.tsx web/src/lib/api.ts internal/service/canvas.go internal/service/canvas_test.go internal/httpapi/canvas.go`：PASS，仅 Windows LF -> CRLF 提示。
- 组节点验证：`go test ./internal/service ./internal/httpapi` 中 `internal/service` PASS，`internal/httpapi` FAIL 于 `TestCanvasModelsUseSub2APIGatewayForBoundUser` 的 `GET /model-catalog` 断言，属于当前模型目录相关改动/既有状态，不是组节点路径。
- 组节点浏览器验证：Vite dev server 已启动在 `http://127.0.0.1:5173/`；打开 `http://127.0.0.1:5173/canvas` 被登录页拦截，未完成登录态内点击验收。
- 拖入组交互补丁验证：`cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- 拖入组交互补丁验证：`cd web && npm.cmd run build`：PASS。
- 拖入组交互补丁验证：`git diff --check -- web/src/app/canvas/types.ts web/src/app/canvas/use-smart-canvas-controller.ts web/src/app/canvas/canvas-node.tsx knowledge/tasks/current-task.md`：PASS，仅 Windows LF -> CRLF 提示。
- 创作任务治理验证：`go test ./internal/service -run "TestImageTaskServiceDiagnosticsAndRepair|TestImageTaskService(CancelQueuedTaskWaitingForCreationUnit|NormalizesTerminalOutputStatusesOnLoad)$"`：PASS。
- 创作任务治理验证：`go test ./internal/httpapi -run TestAdminCreationTaskDiagnosticsAndRepair -count=1 -v`：PASS。
- 创作任务治理验证：`go test ./internal/service ./internal/httpapi -count=1`：PASS。
- 创作任务治理验证：`cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- 创作任务治理验证：`cd web && npm.cmd run build`：PASS。
- 创作任务治理验证：`git diff --check -- internal/service/image_task.go internal/service/image_task_test.go internal/httpapi/routes.go internal/httpapi/router.go internal/httpapi/app_test.go internal/service/permissions.go web/src/lib/api.ts web/src/app/settings/store.ts web/src/app/settings/page.tsx web/src/app/settings/components/creation-task-governance-card.tsx`：PASS，仅 Windows LF -> CRLF 提示。
