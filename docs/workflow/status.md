---
phase: done
current_sprint: pro-studio-v1
total_sprints: 4
pending_action: close-task-008-pro-studio-v1
project_type: web
qa_mode: browser
approval_required: true
last_verified: 2026-06-16
---

# Workflow Status

- 当前阶段：`done`
- 当前 Sprint：`pro-studio-v1`
- 当前目标：为 Canvas 无限画布和 Ecommerce 电商套图工作台新增“生产模式 / Pro Studio v1”，基于 `gpt-image-2-official` 提供用途预设、输出等级、official 参数、批量拆分、后端强校验和 metadata 追踪。
- 下一合法动作：关闭 `task-008-pro-studio-v1`，或由 Planner 进入下一 Sprint 规划。
- 当前 contract：
  - `docs/workflow/tasks/task-008-pro-studio-v1.md`
- Contract review：
  - `docs/workflow/task-008-contract-review.md`
- Worker result：
  - `docs/workflow/worker-results/task-008-pro-studio-v1-result.md`
- QA report：
  - `docs/workflow/qa-reports/task-008-pro-studio-v1-qa.md`
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
- 上轮基线：
  - 独立用户版、素材库、`/canvas` 输出动作栈、`gpt-image-2` 结果序列化和 `ecommerce-suite` v1 已完成基础闭环。
  - `task-007-asset-library-smoke` 已 PASS。
- 未验证项：
  - 真实上游 `gpt-image-2-official` 图片生成仍需可用账号和上游配置后验证。
  - 真实 Sub2API 生产登录/注册、真实充值支付、真实扣费链路仍需部署域名、密钥和支付配置后验证。
  - 团队创建/加入/切换 backend mutations 与团队任务记录闭环仍需真实账号 E2E 补验。
  - `ecommerce-suite` 真实大样本运营素材生成和真实图片生成仍需后续浏览器 E2E 证据。
