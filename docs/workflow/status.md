---
phase: done
current_sprint: image-workspace-followup
total_sprints: 4
pending_action: plan-image-arena-followup-or-run-real-e2e
project_type: web
qa_mode: browser
approval_required: true
last_verified: 2026-06-22
---

# Workflow Status

- 当前阶段：`done`
- 当前 Sprint：`image-workspace-followup`
- 当前目标：保持独立用户版与多工作台创作底座稳定，同时把 image arena、账号级图片输入 URL、签名临时参考图 URL、profile usage 状态与统一模型设置继续收口成默认图片工作台基线。
- 下一合法动作：由 Planner 基于 2026-06-21~2026-06-22 的 image workspace follow-up 进入下一 Sprint，或用真实账号补跑生产 E2E。
- 当前 contract：
  - `docs/workflow/tasks/task-011-ecommerce-production-acceptance.md`
- Contract review：
  - `docs/workflow/task-011-contract-review.md`
- Worker result：
  - `docs/workflow/worker-results/task-011-ecommerce-production-acceptance-result.md`
- QA report：
  - `docs/workflow/qa-reports/task-011-ecommerce-production-acceptance-qa.md`
- 关键依据：
  - 桌面计划文件：`C:/Users/Administrator/Desktop/专业计划开发.txt`
  - ChatGPT 分享链接只读到标题和登录墙，正文未纳入事实源。
  - `web/src/lib/image-task-request.ts` 已是前端图片任务参数入口。
  - `internal/httpapi/sub2api.go` 已包含 official gateway 的 `n=4` batch、official size 白名单、WebP/JPEG compression、public reference URL 和 mask URL 能力。
  - `internal/service/image_task.go` 与 `internal/service/image.go` 已有任务和图片资产 metadata 基础。
- 已执行验证：
  - `go test ./internal/service -run 'Test(ImageServiceImageDetailReturnsProStudioMetadata|ImageTaskServicePreservesProStudioMetadata|NormalizeProStudioRequest|ValidateProStudioRequest)' -count=1`
  - `go test ./internal/httpapi -run 'TestCreationTaskProStudio' -count=1`
  - `go test ./internal/service ./internal/httpapi -count=1`
  - `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"`
  - `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"`
  - `go test ./...`
  - `git diff --check -- task-011 allowed paths`
  - `go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=task-011-smoke" -o output/playwright/task-011-chatgpt2api.exe ./internal`
  - `$env:PLAYWRIGHT_BROWSERS_PATH='F:/java/chatgpt2api/output/playwright/browsers'; $env:SMOKE_BASE_URL='http://127.0.0.1:8095'; node output/playwright/ecommerce-production-acceptance-smoke.mjs`
  - `$env:PLAYWRIGHT_BROWSERS_PATH='F:/java/chatgpt2api/output/playwright/browsers'; node output/playwright/pro-studio-ecommerce-workbench-smoke.mjs`
  - `$env:PLAYWRIGHT_BROWSERS_PATH='F:/java/chatgpt2api/output/playwright/browsers'; node output/playwright/ecommerce-production-delivery-smoke.mjs`
  - 本地容器更新：`chatgpt2api:codex-20260616-task011-acceptance` / `chatgpt2api:local-patched`
  - 本地容器备份：`chatgpt2api:backup-20260616-1723-before-task011`
  - 容器健康检查：`http://127.0.0.1:8081/health` 返回 `status=ok`，版本 `local-20260616-task011-acceptance`
  - 容器页面检查：`http://127.0.0.1:8081/ecommerce-suite` 返回 200 且包含前端资源入口
- 浏览器验收结果：
  - `/canvas` 普通模式基础画布节点加载正常。
  - `/canvas` 生产模式可切换，显示用途、等级、高级 official 设置和 `gpt-image-2-official` 锁模。
  - `/ecommerce-suite` 普通项目创建和旧模板选择正常。
  - `/ecommerce-suite` 生产模式可切换，显示商品主图、电商横幅、详情页竖图、场景图和 SKU 批量图。
  - SKU 8/12 张拆分预览分别为 `4+4` / `4+4+4`。
  - 截图证据：
    - `output/playwright/pro-studio-canvas-production-mode.png`
    - `output/playwright/pro-studio-ecommerce-smoke.png`
    - `output/playwright/pro-studio-ecommerce-sku-batch-smoke.png`
    - `output/playwright/pro-studio-ecommerce-workbench-smoke.png`
    - `output/playwright/ecommerce-production-delivery-smoke.png`
    - `output/playwright/ecommerce-production-acceptance-smoke.png`
- 本轮 `task-011` 验收结果：
  - ZIP 交付包包含 `商品文案.txt`、`manifest.json`。
  - ZIP 图片路径按 `images/商品主图/`、`images/SKU-批量图-1/` 分目录。
  - 归入素材集后显示“打开素材集”，素材库 deep link 带 `collection_id=collection-smoke`。
  - 失败 SKU 批次重试调用 `/api/creation-tasks/image-edits` 且 `n=4`，保留同类型其它成功批次。
- 上轮基线：
  - 独立用户版、素材库、`/canvas` 输出动作栈、`gpt-image-2` 结果序列化和 `ecommerce-suite` v1 已完成基础闭环。
  - `task-007-asset-library-smoke` 已 PASS。
- 2026-06-19 续做入口提示：
  - 6/18~6/19 的默认图片工作台基线已继续前移到 `image gateway model support + /image//canvas//ecommerce-suite 统一模型设置面板 + upstream brand hide + Midjourney generation count clarify + upstream content-policy/size error normalize`。
  - 这些变化目前还没有新的 Sprint contract，但已经属于后续验收、排障和知识入口必须默认理解的稳定背景，不应继续只按 6/16 的电商交付闭环理解当前主线。
- 2026-06-21~2026-06-22 续做入口提示：
  - 默认图片工作台基线已继续前移到 `image arena gallery + app/canvas/image 多页面共享设置 + account image input URL + signed temp reference image URL + profile usage status clarify`。
  - `/image` 不再只按单轮结果列表理解，最近运行结果已开始收口为更明确的 arena 结果视图与电商/画布后续动作入口；真实参考图 URL 也不再假设可长期裸用。
  - `fix: support signed temp reference image urls` 已把临时参考图路径提升为稳定后端边界；后续再看引用图回填、继续编辑或跨页复用时，应默认先检查签名 URL 语义，而不是继续按静态本地/公网 URL 心智理解。
- 未验证项：
  - 真实上游 `gpt-image-2` / `gpt-image-2-official` 502 修复不在 task-009 范围内。
  - 真实上游 `gpt-image-2-official` 图片生成仍需可用账号和上游配置后验证。
  - 真实 Sub2API 生产登录/注册、真实充值支付、真实扣费链路仍需部署域名、密钥和支付配置后验证。
  - 团队创建/加入/切换 backend mutations 与团队任务记录闭环仍需真实账号 E2E 补验。
  - `ecommerce-suite` 真实大样本运营素材生成和真实图片生成仍需后续浏览器 E2E 证据。
- `ecommerce-suite` 真实对象存储图片的 ZIP 打包下载和素材集归档建议用真实账号补一轮人工抽测。
- 6/19 新增未验证项：
  - image gateway 新模型和统一模型设置面板仍缺一轮真实浏览器 smoke，需确认 `/image`、`/canvas`、`/ecommerce-suite` 的模型选择、标签展示与 payload 提交一致。
  - Midjourney generation count、上游图片尺寸错误和内容策略错误归一仍缺真实上游账号回归，当前结论主要来自代码与测试收口。
- 6/21~6/22 新增未验证项：
  - image arena 新结果视图、收藏/加入画布/送电商动作和缩略图切换仍缺一轮真实浏览器 smoke，需确认多图结果在 `/image` 当前默认交互下没有退化。
  - 账号级图片输入 URL、签名临时参考图 URL 与 profile usage 状态文案仍缺真实账号联调，当前结论主要来自代码和定向测试。
