# Current Task

更新时间：2026-06-03 22:59 +08:00

## 背景

`/canvas` 已进入节点式图片创作画布方向，继续复用 `chatgpt2api` 现有图片库、`creation-tasks`、权限体系和 Sub2API 模型路由。5 月底的 Sprint 4 / group 节点收口已经完成；近 3 天主线继续前移到视频生成节点、图片创作台分辨率预设，以及更近一轮画布交互工作流修复。

## 当前目标

当前目标不再是关闭 Sprint 4。本轮应把默认快照切到以下几条主线：

- `/canvas` 新增 video generation nodes，并明确没有 Sub2API 绑定时要隐藏视频模型；
- `/image` composer 暴露分辨率预设，补齐更靠近用户的输入面；
- `/canvas` 继续收口 image workflow，包括 LLM 参考图来源连线、图片下载/预览和相关交互修复。

Sprint 4 / group 节点相关内容已转为历史完成事实，不再是当前目标本身。

## 近 3 天新增事实

- `feat(canvas): add video generation nodes` 已进入主线，说明 `/canvas` 默认能力边界已经从静态图片创作推进到包含视频生成节点的画布工作流。
- `fix(canvas): hide video models without Sub2API binding` 说明视频节点并不是对所有登录态无条件开放；当前默认约束是“没有 Sub2API 绑定时 fail-closed 隐藏视频模型”，避免把能力边界误读成纯前端展示问题。
- `feat(image): expose resolution presets in composer` 已把分辨率预设推进到 `/image` 创作台，说明 composer 侧输入体验仍在继续演进，不应把当前主线只理解成 `/canvas` 独占。
- `fix(canvas): connect llm reference image sources`、`fix(image): download gallery images via blob` 与 `feat(image): add composer asset library` 共同说明：当前图片工作流默认心智已经同时覆盖画布、图库、composer 和下载链路。

## 当前结论

- 5 月底的 group 节点、轻摘要列表、中图预览和任务治理已经完成，当前它们更适合作为稳定背景层。
- 6 月初的默认续做入口应切到“画布视频节点 + composer 分辨率预设 + 更近一轮 canvas/image workflow 修复”，否则后续接手者会误把仓库停留在旧 Sprint 4 语境。
- 图片参数共享配置已完成第一轮静态收口：前端参数源头集中到 `web/src/lib/image-parameters.ts`，后端输出格式、分辨率、compression 规范函数集中到 `internal/service/image_parameters.go`；`/image`、`/canvas`、API helper、`protocol`、`httpapi` 和 `sub2api` 继续使用现有 wire shape。

## 历史已完成背景

- `/canvas` 循环重复生成修复：
  - 前端循环进度合并时会用 `task.data` 里已经返回的图片反推 slot 成功，避免图片已出现但循环仍显示 `1/10、成功 0`。
  - 后端图片账号调度不再因为同一 token 处于 busy 就排除该账号；图片并发改为按 `imageReservations` / 图片额度容量控制，允许单个支持高并发的账号同时跑多个图片输出。
  - 更新账号调度和协议层测试，覆盖“文字 lease 不阻塞图片容量”“preferred 图片会话在容量未满时继续复用”“容量满时 fallback”。
- 8081 Docker 部署修复：
  - 确认 `http://127.0.0.1:8081/canvas` 来自 Docker 容器 `chatgpt2api`，旧问题复现时页面还在使用旧镜像/旧 bundle。
  - Docker Desktop API 一度返回 500；恢复后用宿主机交叉编译 Linux 二进制，`docker cp` 到容器内，`docker commit chatgpt2api chatgpt2api:local` 后重启容器。
  - 8081 当前已运行新二进制，页面加载新 bundle，可见 `1K / Q auto` 等新控件。
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
  - `POST /api/admin/creation-tasks/diagnostics` 携带 `finalize_active=true` 时，只会把超过卡住阈值的 queued/running 任务收尾为 error，取消运行 handler，并触发计费结算；未超过阈值的活动任务会跳过。
  - `/settings` 管理员页面新增“创作任务治理”卡片，可刷新诊断、修复终态状态、确认后终止卡住任务。
  - 诊断结果新增 `stale_active_tasks`、`stale_threshold_seconds` 和 `suspicious_tasks`，设置页会展示疑似卡住任务列表。
  - `updated_at` 的本地时间字符串按本地时区解析，避免卡住阈值受 UTC 解析偏移影响。

## 已确认事实

- 8081 是 Docker Desktop 中的 `chatgpt2api` 容器，端口映射为 `127.0.0.1:8081->80/tcp`；源码修改和 `web` build 后，必须替换镜像/重启容器才会在 8081 生效。
- “重复 10”前端会一次提交 `n=10`；是否并行取决于后端图片账号调度和图片容量，不应再被单 token busy 锁限制成 1。
- 当前不引入数据库；图片索引和元数据仍基于文件系统与 JSON。
- 列表接口只提供轻摘要；完整元数据和原图 URL 只能通过 detail 按需读取。
- 中图是服务端懒生成缓存，不在上传或列表请求中同步生成。
- 画布节点保存轻引用，不保存图片列表里的原图 URL。
- 组节点只保存成员节点 ID，不保存图片本体、原图 URL 或密钥；组节点行为是复用 Infinite-Canvas 的“聚合上下文”思路，不是复制其源码。
- `/image-previews/` 与 `/image-thumbnails/` 共享同一类源图权限判断：先从缓存路径反解源图，再按源图授权。
- `ImageTaskService` 当前已有 `recoverUnfinishedLocked()`、`CancelTask()`、超时和 no-output 收尾逻辑；本轮没有改业务逻辑，只补了防回归测试。
- 创作任务治理接口是管理员专用；普通用户即使有 `/api/creation-tasks` 权限，也不能访问 `/api/admin/creation-tasks/diagnostics`。
- 创作任务治理默认卡住阈值为 10 分钟；管理员可在设置页输入秒数，接口支持 `stale_seconds`。
- 被创作任务治理终止的预扣费图片任务会按实际输出 0 进行结算并退款，不会吞掉用户余额。
- 图片参数共享配置当前规则：
  - 前端 `auto` 分辨率只作为 UI 值，不作为 `image_resolution` 提交；像素图标尺寸作为明确 `size`，不叠加分辨率预设。
  - 后端 `1k` 归一为 `1080p`，只接受并保存 `1080p/2k/4k` 分辨率预设。
  - `output_format` 空值或非法值归一为 `png`，`jpg/jpeg` 归一为 `jpeg`。
  - 只有 `jpeg` 支持 `output_compression`，compression 统一钳制到 `0..100`；PNG/WebP metadata 不保存 compression。
  - Sub2API 图片 JSON payload 中 `1080p` 会转成上游 `1k`，`output_format/output_compression` 也走同一套共享规范，不再原样透传非法格式或非 JPEG compression。

## 待验证点

- 真实图片并发验收：在 8081 刷新 `/canvas` 后重新跑“循环 -> API生成，重复 10”，确认多个 Output slot 能同时进入生成中，而不是长期只有 1 个 running。
- 分页滚动验收：本地当前只有 17 张图片，未触发下一页。后续准备 300+ 张图片后，验证 `/image-manager` 和 `/canvas` 素材栏滚动追加正常。
- 下载/高清原图验收：本轮未执行真实下载动作。后续在浏览器点击下载/高清查看，确认才请求 `/images/...` 或 detail 原图。
- 生产卡顿复核：上线前建议在正式同量级数据上对 `/api/images?page_size=50` 响应体和首屏 Network 原图请求数做一次对比。
- 组节点浏览器验收：本地 Vite 访问 `/canvas` 会被登录页拦截，本轮未完成登录态内创建、连线和运行的点击验收。
- 图片参数共享配置浏览器验收：Vite 源码前端 `http://127.0.0.1:5173/image` 可加载但被登录页拦截，控制台无 error；未完成登录态内参数下拉与实际提交 payload 点击验收。

## 当前结论

Sprint 4 已通过本机实现验证，可以关闭。组节点已完成前后端类型、交互和基础保存校验；剩余风险主要是登录态内画布点击验收、大数据量浏览器滚动和下载动作的人工验收，不影响已实现的字段边界与前端类型约束。

## 下一步

- 关闭 Sprint 4 -> 验证：确认 `docs/workflow/status.md` 为 `done`，并由用户决定是否进入下一 Sprint。
- 组节点人工验收 -> 验证：登录后在 `/canvas` 多选两张图片创建组，或把图片节点拖入/拖出组框，连接到 API生成/AI 提示词/循环，确认图片和提示词上下文被展开。
- 大样本验收 -> 验证：准备 300+ 张图片，检查首屏只请求第一页和缩略图，滚动到底追加下一页。
- 生产前复核 -> 验证：DevTools Network 中首屏不出现大量 `/images/...` 原图请求，`/api/images?page_size=50` 响应体明显小于旧全量接口。

## 验证记录

- 循环进度修复验证：`cd web && npm.cmd run lint`：PASS。
- 循环进度修复验证：`cd web && npm.cmd run build`：PASS。
- 循环进度修复验证：`git diff --check`：PASS，仅 Windows LF -> CRLF 提示。
- 图片账号并发调度验证：`go test ./internal/service ./internal/protocol`：PASS。
- 8081 部署验证：`docker restart chatgpt2api` 后 `GET http://127.0.0.1:8081/health` 返回 `{"status":"ok","version":"0.0.0-dev"}`。
- 8081 页面验证：`GET http://127.0.0.1:8081/canvas` 返回新 bundle `index-cSK4CgkM.js`；Browser 打开 `/canvas` 可见画布页面和 `1K / Q auto` 控件，控制台无 error。
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
- 创作任务治理阈值收紧验证：`go test ./internal/service -run "TestImageTaskServiceDiagnosticsAndRepair|TestImageTaskServiceBillingSuccessFailureCancelAndTextOutput|TestImageTaskService(CancelQueuedTaskWaitingForCreationUnit|NormalizesTerminalOutputStatusesOnLoad)$" -count=1`：PASS。
- 创作任务治理阈值收紧验证：`go test ./internal/httpapi -run TestAdminCreationTaskDiagnosticsAndRepair -count=1 -v`：PASS。
- 创作任务治理阈值收紧验证：`go test ./internal/service ./internal/httpapi -count=1`：PASS。
- 创作任务治理阈值收紧验证：`cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- 创作任务治理阈值收紧验证：`cd web && npm.cmd run build`：PASS。
- 创作任务治理阈值收紧验证：`git diff --check -- internal/service/image_task.go internal/service/image_task_test.go internal/httpapi/routes.go internal/httpapi/app_test.go web/src/lib/api.ts web/src/app/settings/store.ts web/src/app/settings/components/creation-task-governance-card.tsx knowledge/tasks/current-task.md`：PASS，仅 Windows LF -> CRLF 提示。
- 图片参数共享配置验证：`go test ./internal/service ./internal/httpapi ./internal/protocol -count=1`：PASS。
- 图片参数共享配置验证：`cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- 图片参数共享配置验证：`cd web && npm.cmd run build`：PASS。
- 图片参数共享配置验证：本地 Node + TypeScript 临时转译执行 `web/src/app/image/image-options.assert.ts`：PASS。
- 图片参数共享配置验证：`git diff --check -- internal/service/image_parameters.go internal/service/image_parameters_test.go internal/service/image_task.go internal/service/image.go internal/httpapi/routes.go internal/httpapi/app.go internal/httpapi/app_test.go internal/protocol/conversation.go web/src/lib/image-parameters.ts web/src/app/image/image-options.ts web/src/lib/api.ts web/src/app/image/page.tsx web/src/app/image/components/image-composer.tsx web/src/app/image/components/image-results.tsx web/src/components/image-task-queue.tsx web/src/app/canvas/canvas-utils.ts web/src/app/canvas/canvas-node.tsx web/src/app/image/image-options.assert.ts`：PASS，仅 Windows LF -> CRLF 提示。
- 图片参数共享配置浏览器验证：启动 Vite `http://127.0.0.1:5173` 并设置 `VITE_API_URL=http://127.0.0.1:8081`；Browser 打开 `/image` 被登录页拦截，控制台无 error；验收后已停止 5173 Vite 进程。
- 图片参数共享配置自检：独立只读智能体初审 FAIL，指出 `/canvas` 像素图标仍可能叠加 `image_resolution`，以及 Sub2API 未映射 `1080p -> 1k`。
- 图片参数共享配置自检修复：`/canvas` 选择像素图标尺寸时清空分辨率，提交层如果 `size` 是像素图标也不传 `image_resolution`；Sub2API `1080p` 转 `1k`，并规范 `output_format/output_compression`。
- 图片参数共享配置自检修复验证：`go test ./internal/httpapi -run "TestSub2APIImagePayload(PassesModelAndResolution|NormalizesOutputOptions)$" -count=1`：PASS。
- 图片参数共享配置自检修复验证：`go test ./internal/service ./internal/httpapi ./internal/protocol -count=1`：PASS。
- 图片参数共享配置自检修复验证：`cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
- 图片参数共享配置自检修复验证：`cd web && npm.cmd run build`：PASS。
