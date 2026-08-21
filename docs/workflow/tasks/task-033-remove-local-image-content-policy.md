# Task 033: Remove Local Image Content Policy Precheck

## Task ID
task-033-remove-local-image-content-policy

## Role
你是 P/G/E 流程中的 Generator worker。仅按本 contract 移除图片请求的本地关键词内容策略预审，不扩展为上游策略绕过、错误吞掉或其它安全边界变更。

## Goal
移除图片生成、图片编辑、Responses 图片工具和 creation-task 提交前的本地提示词关键词拒绝，让请求直接进入既有上游执行链路。继续识别并如实展示上游真实返回的 content policy 错误。

## Success Criteria
- 所有图片请求入口不再调用本地 `ValidateImageContentPolicy`，成人/色情、暴力及其它提示词均不因本地关键词表被预先拒绝。
- 删除不再使用的本地关键词规则、文本归一化与上下文扫描实现，不保留 no-op 兼容层。
- `premium cultural creative desktop ornament` 不再因空格去除后跨词边界形成 `porn` 而触发本地拒绝。
- 上游返回 `content_policy_violation`、`content policy`、`safety policy` 或现有中文策略错误时，仍归一为 `ImageContentPolicyError` 并保留原始错误语义。
- 图片过大错误归一化、任务失败状态、退款/结算和前端错误展示语义不变。
- 定向测试、相关包测试、全量 Go 测试和差异检查通过。

## Context
- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`
- Root cause: 本地策略先删除空格/标点，再按子串匹配；`desktop ornament` 被拼接为 `desktopornament`，其中跨词边界出现 `porn`。
- Related files: `internal/service/image_content_policy.go`, `internal/protocol/api.go`, `internal/service/image_task.go` 及对应测试。

## Allowed Paths
- `internal/service/image_content_policy.go`
- `internal/service/image_content_policy_test.go`
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`
- `internal/protocol/api.go`
- `internal/protocol/api_test.go`
- `internal/httpapi/app_test.go`
- `docs/workflow/worker-results/task-033-remove-local-image-content-policy-result.md`

## Denied Paths
- `web/**`
- `internal/httpapi/**`（`internal/httpapi/app_test.go` 除外；仅允许更新直接或间接依赖旧本地策略的断言）
- `internal/storage/**`
- `internal/config/**`
- `deploy/**`
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- 数据库迁移、生产配置、Sub2API 协议、计费、鉴权和对象存储实现。

## Constraints
- 用户已明确授权移除截图所示的本地判定；仅移除本地关键词预审，不尝试规避或改写上游供应商的内容策略。
- 保留 `ImageContentPolicyError`、`NormalizeImageRequestError` 和上游策略错误识别，因为这些属于上游错误归一与用户可见诊断，不是本地预审。
- 不将 `ValidateImageContentPolicy` 改成恒定返回 `nil` 的兼容层；删除调用后清理无用实现和测试。
- 不吞掉上游错误，不把上游拒绝改成成功，不改变任务状态、消费数、退款或结算路径。
- 保持最小改动，不做无关重构、格式化或前端修改，不回滚工作区既有改动。

## Acceptance Commands
```powershell
go test ./internal/service -run "Test(ImageTaskService|NormalizeImage|RemoveLocalImage|LocalImage)" -count=1
go test ./internal/protocol -run "Test(HandleImage|NewImageGenerationError|RemoveLocalImage|LocalImage)" -count=1
go test ./internal/service ./internal/protocol ./internal/httpapi -count=1
go test ./...
git diff --check -- internal/service/image_content_policy.go internal/service/image_content_policy_test.go internal/service/image_task.go internal/service/image_task_test.go internal/protocol/api.go internal/protocol/api_test.go internal/httpapi/app_test.go
```

## Output
- `docs/workflow/worker-results/task-033-remove-local-image-content-policy-result.md`
- Worker report 第一行必须是 `### DONE: task-033-remove-local-image-content-policy`、`### BLOCKED: task-033-remove-local-image-content-policy` 或 `### FAILED: task-033-remove-local-image-content-policy`。
- 报告必须列出 changed files、commands run、关键测试结果、风险、contract compliance 和 knowledge_candidates。

## Stop Rules
- 如果移除本地预审必须修改 Denied Paths、生产配置、数据库、计费、鉴权或 Sub2API 协议，停止并报告 `BLOCKED`。
- `internal/httpapi/app_test.go` 只能更新直接或间接依赖“本地关键词应拒绝”的测试：直连入口改为请求可进入既有执行链路；`TestSocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure` 必须改用既有任务限制或测试 handler 注入第二项失败，保留“部分失败时取消已提交任务”的原验证目的。
- 如果现有上游错误归一与本地预审无法在允许路径内解耦，停止并给出具体调用链证据。
- 如果需要吞掉、伪造或绕过上游策略错误才能满足测试，停止并回 Planner 裁决。
- 不得覆盖或回滚工作区中不属于本 task 的既有改动。

## Budget
- worker_mode: `claude-bare-gpt-5.6-terra`
- qa_worker_mode: `codex-agent-gpt-5.6-terra`
- worker_model: `gpt-5.6-terra`
- qa_worker_model: `gpt-5.6-terra`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
