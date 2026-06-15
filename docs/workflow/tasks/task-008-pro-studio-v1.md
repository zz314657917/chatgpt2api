# Task ID
task-008-pro-studio-v1

# Role
Generator

# Goal
实现 Pro Studio / 生产模式 v1：在 Canvas 和 Ecommerce 中复用同一套 `gpt-image-2-official` 能力层、参数校验、payload 构造和 metadata 记录，并保证后端强制锁定 official 模型。

# Success Criteria
- 前端新增共享 Pro Studio 能力层和组件层，Canvas/Ecommerce 不重复定义 official 参数规则。
- Canvas 图片生成节点支持生产模式开关；开启后锁定 `gpt-image-2-official`，显示用途预设、输出等级和折叠高级设置，普通模式保持原行为。
- Canvas 生产模式生成和图生图提交包含 `professional_mode=true`、`pro_studio.enabled=true`、`official_settings`，并支持 public reference image URLs 与 mask。
- Ecommerce 支持商品主图、SKU 批量图、详情页竖图、电商横幅和场景图的 Pro Studio 预设；批量输出在前端拆成 `n<=4` 的多个 creation task，并展示 batch preview。
- 后端对 `professional_mode=true` 或 `pro_studio.enabled=true` 强制 `model=gpt-image-2-official`，校验 official 参数，不允许非法请求绕过前端。
- 任务 public response、历史记录、图片资产 metadata 和 Canvas 结果节点能展示或保留 Pro Studio metadata。
- 普通模式不受影响：不开启生产模式时，现有 `gpt-image-2`、`gpt-image-2-official`、Nano Banana、Canvas、Ecommerce 旧流程保持可用。

# Context
- Repo: `F:/java/chatgpt2api`
- Read first:
  - `docs/workflow/spec.md`
  - `docs/workflow/status.md`
  - `AGENTS.md`
- Current evidence:
  - `web/src/lib/image-task-request.ts` 已是前端统一图片任务参数入口。
  - `internal/httpapi/sub2api.go` 已包含 official gateway batch limit 4、official size 白名单、WebP/JPEG compression、public `image_urls` / `mask_url` 处理。
  - `internal/service/image_task.go` 已保存任务基础字段和部分 image tool fields。
  - `internal/service/image.go` 已保存图片资产 prompt/model/quality/resolution/requested_size/output_format/output_compression/background/moderation/reference_images。
  - ChatGPT 分享链接 `https://chatgpt.com/s/t_6a3020bdc0808191abc25e4a54127022` 当前只读到标题和登录墙，不能作为正文事实源。

# Allowed Paths
- `web/src/lib/pro-studio/**`
- `web/src/components/pro-studio/**`
- `web/src/lib/image-task-request.ts`
- `web/src/lib/image-task-request.assert.ts`
- `web/src/lib/image-parameters.ts`
- `web/src/lib/api.ts`
- `web/src/lib/api.assert.ts`
- `web/src/app/canvas/**`
- `web/src/app/ecommerce-suite/**`
- `web/src/store/ecommerce-suite-projects.ts`
- `web/src/app/image-manager/page.tsx`
- `web/src/components/image-output-controls.tsx`
- `internal/service/image_parameters.go`
- `internal/service/image_parameters_test.go`
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`
- `internal/service/image.go`
- `internal/service/image_test.go`
- `internal/service/image_pricing.go`
- `internal/service/image_pricing_test.go`
- `internal/service/pro_studio.go`
- `internal/service/pro_studio_test.go`
- `internal/httpapi/app.go`
- `internal/httpapi/routes.go`
- `internal/httpapi/sub2api.go`
- `internal/httpapi/sub2api_test.go`
- `internal/httpapi/app_test.go`
- `internal/backend/responses_image.go`
- `internal/backend/backend_test.go`
- `docs/workflow/**`

# Denied Paths
- 数据库 schema、迁移脚本或持久化格式大改。
- Sub2API 支付、充值、登录、launch token 或扣费协议。
- `deploy/**`、`.env*`、生产配置、密钥、账号 token、cookie。
- 新增第三方依赖，除非 Codex 先单独批准。
- 重写 creation-task 系统、素材库系统、Canvas 文档存储系统或 Sub2API bridge 架构。
- `knowledge/**` 和 `C:/Users/Administrator/.codex/memories/**`。

# Constraints
- 使用简体中文输出；代码注释如需新增使用英文。
- 不做兼容层和多路径兜底；面向当前项目 API 版本实现。
- 保持最小改动，不做无关重构、无关格式化或 UI 大换皮。
- `professional_mode=true` / `pro_studio.enabled=true` 是唯一生产模式触发条件；触发后必须强制 official 模型。
- official Pro Studio 新状态保存 `1k|2k|4k`；如需兼容现有 `1080p`，只在边界归一为 `1k`，不要把 Pro Studio metadata 写成 `1080p`。
- `output_compression` 仅允许 JPEG/WebP；PNG 搭配 compression 应报错或忽略提交前阻止，不能静默误导用户。
- `background=transparent` 不属于 Pro Studio v1；生产模式仅允许 `auto|opaque`。
- official 单任务 `n` 最大 4；前端批量拆任务，后端单请求 `n>4` 返回明确错误。
- 参考图最多 16 张；`mask_url` / `input_image_mask` 必须搭配参考图。
- 普通模式不应被 Pro Studio 校验污染。
- 开始实现前先完成一次 Phase 0 代码调用链盘点，并在 worker report 中记录：
  - UI 到 creation-task 的图片生成提交路径。
  - Canvas payload 构造和轮询结果写回路径。
  - Ecommerce payload 构造、参考图上传和批量提交路径。
  - 后端 creation-task 提交、metadata 保存、official gateway payload 和图片资产记录路径。
  - 当前可复用的 official 参数、compression、public image URL / mask URL 能力。

# Acceptance Commands
```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
```

# Browser QA Scenarios
- `/canvas` 普通模式图片生成节点仍可选择普通模型并提交。
- `/canvas` 生产模式 1:1 + 4K + high 任务提交时 payload 锁定 `gpt-image-2-official`。
- `/canvas` 生产模式 16:9 + 4K + high 任务提交时参数和 badge 正确。
- `/canvas` 生产模式图生图、多参考图、mask 输入按 public image URL / mask URL 规则提交。
- `/ecommerce-suite` 普通模式旧套图流程仍可用。
- `/ecommerce-suite` 生产模式商品主图、横幅、详情页竖图、场景图使用对应预设。
- `/ecommerce-suite` SKU 8 张拆成 2 个任务，12 张拆成 3 个任务，UI 展示 batch preview。
- 历史记录、素材库详情或结果节点能看到 `生产模式`、intent、quality tier、official settings badge/metadata。

# Output
- 按 `C:/Users/Administrator/.codex/templates/worker-result.md` 写 `docs/workflow/worker-results/task-008-pro-studio-v1-result.md`。
- Worker report 第一行必须是 `### DONE: task-008-pro-studio-v1`、`### BLOCKED: task-008-pro-studio-v1` 或 `### FAILED: task-008-pro-studio-v1`。
- 必须列出 changed files、commands run、test output、risks、knowledge_candidates。
- 不直接写长期知识库；如发现可沉淀结论，只放到 `knowledge_candidates`。

# Stop Rules
- 如果需要修改 Denied Paths，立即停止并请求 Codex 裁决。
- 如果 official gateway 参数与 contract 冲突，先停止并给出最小证据，不自行改协议。
- 如果需要新增数据库 schema、生产配置或第三方依赖，先停止。
- 如果普通模式测试失败且无法用小改动修复，停止并报告影响范围。
- 如果 contract 中的验收命令无法执行，报告 `BLOCKED` 并说明缺失环境。

# Budget
- worker_mode: `claude-bare-deepseek-v4-pro`
- qa_worker_mode: `claude-bare-deepseek-v4-pro`
- worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.20`
- worktree_root: `E:/codex-worktrees`
