---
task_id: task-020-image-tool-text-response-hardening
phase: contract-approved
owner: codex
qa_mode: runtime
created_at: 2026-07-21
---

# Task 020: Image Tool Text-Response Hardening

## Role

Generator

## Goal

修复强制生图工具在上游没有真正产生 `image_generation_call`、却返回普通 `output_text` 时的错误归一。图片接口和 creation-task 必须把“只有文本、没有图片”视为失败，保留上游文本作为诊断信息，并保证预扣图片费用按既有幂等语义只退款一次。

## Success Criteria

- 路由矩阵可由测试明确区分：主模型、工具模型、实际选择的上游路由和出站 payload 中的 `model` / `tools` / `tool_choice` / `instructions` 均可观察；不把“请求带有 image_generation 字段”当成“上游已调用图片工具”。
- Codex Responses 图片流能够识别最终 `output_text`，并区分排队/进度文本、最终普通文本和真正的 `image_generation_call`；没有图片调用时不得生成成功的图片 output item 或正常完成态。
- 上游普通文本（例如旅游攻略）被保留在 typed error、任务诊断或等价的现有错误载荷中，同时归一为明确的图片工具失败码；没有文本时仍返回稳定的 no-image-output 错误，不泄露 token、cookie 或原始私有请求。
- `/v1/images/generations`、`/v1/images/edits` 及 `/v1/responses` 的强制生图分支行为一致：只有图片结果才算成功；普通文本不能被伪装成图片成功，也不能被静默降级成普通聊天。
- generate/edit creation-task 在文本-only 或 no-image-output 失败时状态为 error/cancelled（按现有上下文规则），图片消费数为 `0`，Sub2API 或本地预扣金额只退款一次；既有 chat 文本任务语义保持不变。
- 覆盖正常 `image_generation_call`、普通文本、空输出、上游错误、流式/非流式和重复结算场景；现有图片、计费、内容策略和模型映射回归不退化。

## Context

- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/status.md`, `docs/workflow/agent-matrix.md`, `docs/workflow/spec.md`
- 已知证据：`internal/backend/responses_image.go` 的 Codex 请求固定主模型为 `gpt-5.4-mini`，并要求 image-generation tool；当前解析器对普通 `output_text` 的处理与图片结果判定不完整。
- 已知证据：`internal/protocol/conversation.go` 已有 `image_generation_text_response` 错误，但 `/v1/responses` image-tool 分支尚未统一设置文本即错误的契约；`internal/service/image_task.go` 需要确认 generate/edit 文本结果不会被当成成功。
- 已知证据：当前工作区存在 Task-017/018/019、Canvas 和素材侧栏等用户 dirty changes，worker 不得回滚或格式化这些文件。

## Allowed Paths

- `internal/backend/responses_image.go`
- `internal/backend/backend_test.go`
- `internal/protocol/api.go`
- `internal/protocol/api_test.go`
- `internal/protocol/conversation.go`
- `internal/protocol/conversation_test.go`
- `internal/httpapi/app_test.go`
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`
- `docs/workflow/evidence/task-020-image-tool-text-response-hardening/**`
- `docs/workflow/worker-results/task-020-image-tool-text-response-hardening-result.md`

## Denied Paths

- `web/**`、Canvas、素材库和其它工作台 UI
- `internal/storage/**`、数据库迁移、生产配置和部署文件
- `knowledge/**`、`C:/Users/Administrator/.codex/memories/**`
- Sub2API 仓库、外部服务代码和真实账号数据
- 未在 Allowed Paths 中列出的协议、计费或架构入口

## Constraints

- 先用脱敏测试替身或 capture 固定路由/事件契约；不得把真实 token、cookie、账号标识、私有 prompt 或可复用下载 URL 写入仓库。
- 保持主模型与工具模型语义可追踪。只有在出站证据和现有上游契约都支持时才能调整映射；不通过静默 fallback 把失败请求改成普通聊天或另一条图片链路。
- 统一错误时保留现有错误类型、HTTP 映射和本地化边界；新增字段必须能兼容现有客户端，不伪造 `image_generation_call`、`b64_json` 或图片 URL。
- generate/edit 的文本-only 结果不得触发图片成功结算；chat 的合法文本输出和已有 `MessageAsError` 语义不得被误伤。
- 退款沿用已有 `reserve / commit / refund` 与 charge key 幂等边界，不引入第二套账务状态机；不得因重试、任务保存失败或重复结算导致二次退款。
- 修改保持最小范围，worker 只改 Allowed Paths，并在 report 中列出 changed files、contract compliance、命令和未验证风险。

## Acceptance Commands

```powershell
go test ./internal/backend ./internal/protocol ./internal/service ./internal/httpapi -count=1
go test ./...
git diff --check
```

必须补充并执行以下证据：

- 路由/请求构造测试：覆盖 `gpt-5.4-mini`、`gpt-image-2`、`codex-gpt-image-2` 的主模型/工具模型组合，并断言实际出站 payload，而不是只断言输入字段存在。
- Responses 解析测试：覆盖 `image_generation_call`、最终 `output_text`、只有进度文本、空 `response.completed` 和上游 `error`。
- HTTP/creation-task 测试：覆盖普通文本返回的明确失败码、generate/edit 的 error 状态、图片消费数为 `0`、Sub2API/本地退款各只发生一次，以及重复 settlement 不重复退款。
- 若需要真实账号联调，只能使用脱敏 capture；报告必须写清部署版本、是否走旧容器/旧二进制，以及未执行的真实上游项。

## Output

- 按 `C:/Users/Administrator/.codex/templates/worker-result.md` 写入 `docs/workflow/worker-results/task-020-image-tool-text-response-hardening-result.md`。
- worker report 第一行必须是 `### DONE: task-020-image-tool-text-response-hardening`、`### BLOCKED: ...` 或 `### FAILED: ...`。
- 不直接修改 `docs/workflow/status.md`、`docs/workflow/spec.md` 或长期知识库；由 Codex 审核后更新 workflow 事实源。

## Stop Rules

- 无法从测试替身或脱敏 capture 证明实际路由/出站 payload 时停止，不自行猜测主模型与工具模型映射。
- 需要修改数据库、Sub2API 协议、生产部署、安全边界或 Denied Paths 时停止并回 Planner。
- 发现 generate/edit 与 chat 文本语义无法在不破坏现有兼容性的前提下区分时停止，提交 BLOCKED 供 Codex 重新拆分 contract。
- 连续两轮测试或 QA 失败、出现重复退款或伪造图片成功结果时停止 worker loop，不自行扩大范围。

## Budget

- worker_mode: `claude-bare-deepseek-v4-pro`
- qa_worker_mode: `claude-bare-deepseek-v4-pro`
- worker_model: `deepseek-v4-pro`
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
