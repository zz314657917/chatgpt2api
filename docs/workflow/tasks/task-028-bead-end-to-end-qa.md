---
task_id: task-028-bead-end-to-end-qa
phase: contract-draft
owner: codex
qa_mode: browser
created_at: 2026-08-05
---

# Task 028: Bead End-to-End QA

## Task ID

task-028-bead-end-to-end-qa

## Role

Evaluator。只执行最终验收、复核既有 Sprint 证据和写入 QA 结论；除非验收自身的可重复脚本存在错误，不修改产品代码或拼豆 API。

## Goal

对 Task-025、Task-026 和 Task-027 形成完整的 evidence-first 验收结论：工程服务契约、工作台核心能力、素材与移动端互通、构建预算及全部后端回归均需有真实命令或浏览器证据。明确区分 checkout 验证、mock 浏览器验证和未做的真实生产验证。

## Success Criteria

- 复核 Task-025 CRUD、隔离、revision、校验和 RBAC 定向测试；复核 Task-026 项目列表、图片转换、编辑/图层、3D、四种导出、JSON 新工程与桌面证据；重新执行 Task-027 自动保存、冲突、素材、PNG 回存和移动端脚本。
- 执行 `npm.cmd run lint`、`npm.cmd run build`、`npm.cmd run check:bundle`、`go test ./...` 和 `git diff --check`。全包 Go 测试若失败，必须标明失败的包/测试、与拼豆改动的关系及是否阻断最终结论；不得修改无关业务让测试变绿。
- 在 `1440x900`、`1280x720`、`390x844` 对照已有证据或重新采集：无横向溢出、按钮文字未裁切、抽屉不遮挡触控画布、深浅色对比可读。3D 预览必须有非空像素与旋转前后差异的既有或新证据。
- 复核工程 document 及导出 JSON 不含 `data:`、`blob:`、临时签名 URL、图片二进制或 undo/redo 栈；素材引用只允许个人或有 `team_id` 的团队引用。
- 输出正式 QA 报告和最终 `review-and-verification` 报告，使用 `Findings / Executed Checks / Unverified Risks / Recommendation`，不得称真实部署或生产已生效。

## Allowed Paths

- `docs/workflow/**`
- `output/playwright/task-028-*`
- 验收过程中已有的 `output/playwright/task-025-*`、`task-026-*`、`task-027-*` 证据仅可读取。

## Denied Paths

- `internal/**`、`web/src/**`、`web/package*.json`、Vite 配置、数据库迁移、素材库 API、Sub2API、计费、Docker、部署、生产配置和 `knowledge/**`。

## Constraints

- 不把 mock API、Vite 开发服务器或本地截图表述为真实服务/生产验证。
- 不忽略全包失败，也不修改无关链路将其隐藏。无法归因或无法执行时报告 `BLOCKED`，不要伪报 PASS。
- 不升级依赖、不创建新后端端点、不改工程 schema，且不提交、推送、部署或更新 Docker。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run check:bundle"
go test ./...
git diff --check
```

## Browser QA

- 运行 `output/playwright/task-027-browser-qa.js`，覆盖保存、素材、导出、409、路由隔离和移动端。
- 审核 Task-026 的已存截图/导出工件，确认 3D 非空/旋转、PNG/PDF/XLSX/JSON 头部和项目列表/桌面布局证据完整；缺失或互相矛盾时判定 FAIL 或 BLOCKED。

## Output

- `docs/workflow/worker-results/task-028-bead-end-to-end-qa-result.md`
- `docs/workflow/qa-reports/task-028-bead-end-to-end-qa.md`
- `docs/workflow/qa-reports/bead-workshop-final-review.md`

QA 报告第一行必须是 `### PASS: task-028-bead-end-to-end-qa`、`### FAIL: task-028-bead-end-to-end-qa` 或 `### BLOCKED: task-028-bead-end-to-end-qa`。

## Stop Rules

- 全包 Go 测试出现无法归因的新增失败、核心拼豆测试失败、浏览器脚本失败、预算超限或发现工程持久化泄露 URL/二进制时停止并判定 FAIL。
- 只有真实登录、对象存储或生产部署才能验证的内容，列为未验证风险，不能阻塞 checkout/mock 范围内已充分证明的结论。
