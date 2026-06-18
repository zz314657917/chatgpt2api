# Task ID
task-010-ecommerce-production-delivery

# Role
Generator

# Goal
把电商套图生产模式从“能生成/能预览”推进到“能交付/能复用/能沉淀”：整套 ZIP 下载、清晰文件命名、商品文案保存为文本素材、已完成图片归入项目素材集。真实上游 502、支付/扣费、数据库 schema 和生产配置不在本任务范围内。

# Success Criteria
- 结果区提供“打包下载”入口，将所有已完成图片打成 ZIP 下载，不新增第三方依赖；ZIP 内文件名包含项目名、素材类型、批次/序号，避免全部叫 `image.png`。
- 单图下载沿用同一命名规则，生产模式 SKU 分批命名不能出现 `sku_variants-1` 这类内部 ID。
- 商品文案策划区域提供“保存为文本素材”入口，把当前结构化文案保存到现有 `/api/text-assets`；保存成功后给出明确提示。
- 已完成图片提供“归入项目素材集”入口：若项目素材集不存在则创建，随后把有 `path` 的已完成图片加入该素材集；无 `path` 的本地 data URL 结果跳过并提示。
- 以上交付动作不改变生成任务、真实扣费、素材库后端、数据库 schema 或 Sub2API 协议。
- 普通模式旧模板仍可单图下载、打包下载、总览图下载和失败重试。

# Context
- Repo: `F:/java/chatgpt2api`
- Read first:
  - `docs/workflow/status.md`
  - `docs/workflow/spec.md`
  - `web/src/app/ecommerce-suite/page.tsx`
  - `web/src/lib/api.ts`
  - `web/src/store/ecommerce-suite-projects.ts`
- Current baseline:
  - `task-009` 已完成电商工作台生成反馈、文案结构化预览、结果分组、批量下载和总览图无水印/无模板覆盖字。
  - `web/src/lib/api.ts` 已有 `createManagedTextAsset`、`createManagedImageCollection`、`updateManagedImageCollectionItems`。
  - 图片资产已通过 `path` 关联素材库；没有 `path` 的 data URL 结果不能归入后端素材集。

# Allowed Paths
- `docs/workflow/status.md`
- `docs/workflow/main-log.md`
- `docs/workflow/tasks/task-010-ecommerce-production-delivery.md`
- `docs/workflow/task-010-contract-review.md`
- `docs/workflow/worker-results/task-010-ecommerce-production-delivery-result.md`
- `docs/workflow/qa-reports/task-010-ecommerce-production-delivery-qa.md`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/store/ecommerce-suite-projects.ts`
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
- 保持最小改动，不新增第三方依赖。
- ZIP 只做前端本地打包，不引入服务端导出接口。
- 文本素材和素材集复用现有 API，不扩展后端字段。
- 不处理真实上游 502，不声明真实模型成功率。
- 不静默删除用户已有项目数据；本地存储兼容旧项目。

# Acceptance Commands
```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
```

# Browser QA Scenarios
- `/ecommerce-suite` 有完成结果时，点击“打包下载”能触发 ZIP 文件下载，文件名包含项目名，ZIP 内图片文件名包含素材类型。
- 单图下载文件名不含内部 batch/template ID。
- 有商品文案时，“保存为文本素材”可调用 `/api/text-assets` 并提示成功；空文案时按钮禁用或提示。
- 有 `path` 的完成结果可归入项目素材集；没有可归档 `path` 时给出跳过/不可归档提示。
- “下载总览图”仍导出无底部模板文字覆盖的干净总览。

# Output
- 按 `C:/Users/Administrator/.codex/templates/worker-result.md` 写 `docs/workflow/worker-results/task-010-ecommerce-production-delivery-result.md`。
- QA report 第一行必须是 `### PASS: task-010-ecommerce-production-delivery`、`### FAIL: task-010-ecommerce-production-delivery` 或 `### BLOCKED: task-010-ecommerce-production-delivery`。
- 必须列出 changed files、commands run、test output、risks、knowledge_candidates。
- 不直接写长期知识库。

# Stop Rules
- 如果需要修改 Denied Paths，立即停止并请求 Codex 裁决。
- 如果需要新增数据库 schema、生产配置或第三方依赖，立即停止。
- 如果现有 text-assets 或 image-collections API 不足以完成，降级为前端提示和文档，不扩展后端。
- 如果验收命令无法执行，报告 `BLOCKED` 并说明缺失环境。

# Budget
- worker_mode: `codex-local`
- qa_worker_mode: `codex-local`
- worker_model: `gpt-5.5`
- max_budget_usd: `0`
- worktree_root: `F:/java/chatgpt2api`
