# Task ID
task-009-pro-studio-production-workbench

# Role
Generator

# Goal
完善 Pro Studio v2 的本地生产工作台体验：生成反馈、商品文案策划、多产品图/参考图、结果分组与批量操作。真实图片上游 502、支付/扣费、数据库 schema 和生产配置不在本任务范围内。

# Success Criteria
- 电商套图提交后，项目状态立即写入 queued placeholders，右侧任务队列能显示电商套图处理中、计时、排队/处理中数量和完成提示。
- 商品文案策划区域固定高度，不因生成/轮询内容变动导致页面上下抖动；文案结果能以“标题、卖点、参数、详情页文案、视觉方向”等结构化块展示，并保留可编辑原文。
- 产品图和参考图继续支持多张添加，展示每个槽位的数量、上传状态和角色；生成前校验至少有产品图。
- 生产模式结果按素材类型分组展示：商品主图、电商横幅、详情页竖图、场景图、SKU 批量图；SKU 分批结果展示批次编号而不是找不到模板名称。
- 已完成结果支持单图下载、失败单项重试；结果区提供批量下载已完成图片和整套总览下载。
- 普通模式旧模板结果仍可展示和重试，不被生产模式分组逻辑破坏。

# Context
- Repo: `F:/java/chatgpt2api`
- Read first:
  - `docs/workflow/spec.md`
  - `docs/workflow/status.md`
  - `web/src/app/ecommerce-suite/page.tsx`
  - `web/src/store/ecommerce-suite-projects.ts`
  - `web/src/components/image-task-queue.tsx`
- Current baseline:
  - `task-008-pro-studio-v1` 已完成 Pro Studio capability、payload、后端强校验、Canvas/Ecommerce 接入和 metadata。
  - `web/src/components/image-task-queue.tsx` 已有电商队列聚合、计时和完成提示基础。
  - `web/src/app/ecommerce-suite/page.tsx` 已有文案策划、多图上传、参考图上传、批量占位和结果展示基础。

# Allowed Paths
- `docs/workflow/status.md`
- `docs/workflow/main-log.md`
- `docs/workflow/tasks/task-009-pro-studio-production-workbench.md`
- `docs/workflow/task-009-contract-review.md`
- `docs/workflow/worker-results/task-009-pro-studio-production-workbench-result.md`
- `docs/workflow/qa-reports/task-009-pro-studio-production-workbench-qa.md`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/store/ecommerce-suite-projects.ts`
- `web/src/components/image-task-queue.tsx`
- `web/src/components/pro-studio/**`
- `web/src/lib/pro-studio/**`
- `web/src/lib/api.ts`
- `web/src/lib/api.assert.ts`

# Denied Paths
- 数据库 schema、迁移脚本、部署配置、`.env*`、生产密钥、账号 token、cookie。
- Sub2API 支付、充值、登录、launch token 或扣费协议。
- `deploy/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- 重写 creation-task、素材库、Canvas 文档存储或 Sub2API bridge 架构。

# Constraints
- 使用简体中文输出；新增代码注释如确需使用英文。
- 保持最小改动，不做无关重构或大范围 UI 换皮。
- 不处理真实上游 502，本任务只保证本地任务状态和工作台体验。
- 不新增第三方依赖。
- 不改变普通模式生成入口和旧模板语义。
- 不静默删除用户已有项目数据；本地存储兼容旧 `templateId`。

# Acceptance Commands
```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
```

# Browser QA Scenarios
- `/ecommerce-suite` 可创建项目，产品图和参考图槽位均能多图添加并显示数量。
- 点击“生成文案”后，文案区保持固定高度，状态显示生成中；任务完成或失败时不造成页面上下抽搐。
- 生产模式选择 SKU 8/12 张时，批量预览仍为 `4+4` / `4+4+4`。
- 点击生成生产素材后，右侧任务队列出现电商套图卡片，显示计时、排队/处理中数量、进度和完成提示。
- 结果区按素材类型分组，SKU 分批结果能显示“SKU 批量图 · 批次 N”。
- 已完成结果可单图下载，结果区可批量下载已完成图片和下载总览图。

# Output
- 按 `C:/Users/Administrator/.codex/templates/worker-result.md` 写 `docs/workflow/worker-results/task-009-pro-studio-production-workbench-result.md`。
- Worker report 第一行必须是 `### DONE: task-009-pro-studio-production-workbench`、`### BLOCKED: task-009-pro-studio-production-workbench` 或 `### FAILED: task-009-pro-studio-production-workbench`。
- 必须列出 changed files、commands run、test output、risks、knowledge_candidates。
- 不直接写长期知识库。

# Stop Rules
- 如果需要修改 Denied Paths，立即停止并请求 Codex 裁决。
- 如果需要新增数据库 schema、生产配置或第三方依赖，立即停止。
- 如果普通模式生成入口被破坏且无法小改修复，停止并报告影响范围。
- 如果验收命令无法执行，报告 `BLOCKED` 并说明缺失环境。

# Budget
- worker_mode: `codex-local`
- qa_worker_mode: `codex-local`
- worker_model: `gpt-5.5`
- max_budget_usd: `0`
- worktree_root: `F:/java/chatgpt2api`
