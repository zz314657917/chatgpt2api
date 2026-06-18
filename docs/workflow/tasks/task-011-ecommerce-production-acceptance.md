# Task ID
task-011-ecommerce-production-acceptance

# Role
Generator

# Goal
把电商套图生产模式从“交付动作可用”推进到“交付包完整、素材归档可直达、失败项可精准补齐”。真实上游模型稳定性、支付/扣费、数据库 schema 和 Sub2API 协议不在本任务范围内。

# Success Criteria
- ZIP 打包下载除了图片外，必须包含 `商品文案.txt` 和 `manifest.json`；没有文案时仍生成 manifest。
- ZIP 内图片按 `images/<素材类型>/...` 分目录，文件名继续保持项目名、素材类型、批次/序号，不暴露 `sku_variants-1` 等内部 ID。
- `manifest.json` 记录项目名、平台、市场、语言、导出时间、图片数量、每张图的素材类型、批次、状态、文件名、task_id、path、Pro Studio intent 和 official settings。
- 归入素材集成功后提供可点击入口，打开素材库并自动定位到刚创建/更新的素材集。
- `/image-manager` 支持通过 query 参数选中个人素材集，例如 `?collection_id=<id>`，且不会影响原本手动筛选行为。
- 失败项重试应精准替换当前失败项/当前批次，不清空同一类型里已经成功的其它批次或结果。
- 保持普通模式旧模板的下载、打包、总览图、归档和重试行为可用。

# Context
- Repo: `F:/java/chatgpt2api`
- Read first:
  - `docs/workflow/status.md`
  - `docs/workflow/spec.md`
  - `web/src/app/ecommerce-suite/page.tsx`
  - `web/src/app/image-manager/page.tsx`
  - `web/src/lib/api.ts`
- Current baseline:
  - `task-010` 已完成 ZIP 图片打包、保存文案、归入素材集、单图命名和总览图干净导出。
  - `web/src/app/ecommerce-suite/page.tsx` 内已有本地 ZIP writer，不新增依赖。
  - `image-manager` 已有素材集筛选状态 `selectedCollectionId` 和素材集 API。

# Allowed Paths
- `docs/workflow/status.md`
- `docs/workflow/main-log.md`
- `docs/workflow/tasks/task-011-ecommerce-production-acceptance.md`
- `docs/workflow/task-011-contract-review.md`
- `docs/workflow/worker-results/task-011-ecommerce-production-acceptance-result.md`
- `docs/workflow/qa-reports/task-011-ecommerce-production-acceptance-qa.md`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/app/image-manager/page.tsx`

# Denied Paths
- 数据库 schema、迁移脚本、部署配置、`.env*`、生产密钥、账号 token、cookie。
- Sub2API 支付、充值、登录、launch token 或扣费协议。
- `deploy/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- 重写 creation-task、素材库后端、Canvas 文档存储或 Sub2API bridge 架构。

# Constraints
- 使用简体中文输出；新增代码注释如确需使用英文。
- 保持最小改动，不新增第三方依赖。
- ZIP 继续只在前端本地打包，不引入服务端导出接口。
- 素材集归档继续复用现有 `/api/image-collections` 和 `/api/image-collections/items`。
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
- `/ecommerce-suite` 有完成结果时，点击“打包下载”能触发 ZIP，ZIP 内包含 `商品文案.txt`、`manifest.json` 和分目录图片。
- ZIP manifest 能解析为 JSON，图片条目包含素材类型、批次、文件名和 task/path 元数据。
- 点击“归入素材集”成功后，可通过提示入口打开 `/image-manager?collection_id=<id>`，素材库自动选中对应素材集。
- 有多个同类批次时，只重试一个失败批次不会移除其它成功批次。
- “下载总览图”仍导出无底部模板文字覆盖的干净总览。

# Output
- 写 `docs/workflow/worker-results/task-011-ecommerce-production-acceptance-result.md`。
- QA report 第一行必须是 `### PASS: task-011-ecommerce-production-acceptance`、`### FAIL: task-011-ecommerce-production-acceptance` 或 `### BLOCKED: task-011-ecommerce-production-acceptance`。
- 必须列出 changed files、commands run、test output、risks、knowledge_candidates。
- 不直接写长期知识库。

# Stop Rules
- 如果需要修改 Denied Paths，立即停止并请求 Codex 裁决。
- 如果需要新增数据库 schema、生产配置或第三方依赖，立即停止。
- 如果现有素材集 API 不足以完成，降级为前端提示和文档，不扩展后端。
- 如果验收命令无法执行，报告 `BLOCKED` 并说明缺失环境。

# Budget
- worker_mode: `codex-local`
- qa_worker_mode: `codex-local`
- worker_model: `gpt-5.5`
- max_budget_usd: `0`
- worktree_root: `F:/java/chatgpt2api`
