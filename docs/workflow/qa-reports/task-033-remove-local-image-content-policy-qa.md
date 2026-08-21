### PASS: task-033-remove-local-image-content-policy

## Findings

- 未发现明确问题。
- 限定的 7 个业务/测试文件均有且仅有预期 task diff；工作区另有大量无关改动，未纳入本次 QA 结论。
- `ValidateImageContentPolicy`、规则表、规则匹配、文本归一化、上下文扫描及 data-URL 辅助函数在 `internal/service` 与 `internal/protocol` 中均无残留；不存在改为恒定放行的 no-op 层。
- 所有图片入口的本地调用已删除：generation、edit、chat（含 streaming）、Responses image tool、creation-task generation/edit/chat/video/metadata 提交。
- `ImageContentPolicyError`、`NormalizeImageRequestError`、上游 `content policy`、`content_policy_violation`、`safety policy` 和中文策略错误识别仍保留；图片过大归一、任务失败错误字段及 HTTP/OpenAI 错误展示路径仍保留。
- `internal/httpapi/app_test.go` 的三项旧本地拒绝断言已改为请求进入既有执行链路；Social partial-failure 用既有 RPM 限制产生第二项失败，并继续断言首项持久化、已取消和无取消错误，符合 Amendments 1/2。

## Commands/Evidence

- `go test ./internal/service -run "Test(ImageTaskService|NormalizeImage|RemoveLocalImage|LocalImage)" -count=1` — PASS (`ok`, 1.371s)。
- `go test ./internal/protocol -run "Test(HandleImage|NewImageGenerationError|RemoveLocalImage|LocalImage)" -count=1` — PASS (`ok`, 0.033s)。
- `go test ./internal/httpapi -run "Test(CreationTaskQueuesLocalPolicyKeywords|DirectImageGenerationPassesLocalPolicyKeywordsToExistingExecution|ResponsesImageGenerationPassesLocalPolicyKeywordsToExistingExecution|SocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure)$" -count=1` — PASS (`ok`, 0.278s)。
- `go test ./internal/service ./internal/protocol ./internal/httpapi -count=1` — PASS（service 5.087s、protocol 0.411s、httpapi 17.419s）。
- `go test ./...` — PASS（所有列出的包通过）。
- `rg -n "ValidateImageContentPolicy|imageContentPolicyRules|imageContentPolicyRule|normalizeImagePolicyText|appendPolicyTexts|appendPolicyTextsFromMap|isDataImageURL" internal/service internal/protocol` — 无匹配。
- `git diff --check --` 加限定 7 条 task 路径 — PASS；仅出现既有 LF/CRLF Git 提示，无空白错误。
- `git diff --name-only --` 加限定 7 条 task 路径 — 恰为 contract 指定的 7 个文件。
- 源码与单测审查确认：`premium cultural creative desktop ornament` 会进入 protocol 与 service 的实际执行/排队路径；上游策略和图片过大错误在 `NormalizeImageRequestError` 及 HTTP 错误转换处仍被归一。

## Risks

- 未发起真实上游供应商调用；真实上游 content-policy 拒绝仍是未验证的运行态风险，但本地注入上游错误的测试及现有归一化调用链已通过，不单独构成 BLOCKED。
- 本轮未构建或部署运行中服务；结论限于当前工作区源码与 Go 测试。

## Contract Compliance

- PASS。变更只覆盖允许的 7 个代码/测试路径；HTTP 测试修改严格限于 Amendments 1/2 所列的旧本地策略依赖断言。
- 未发现上游策略绕过、吞错、伪造成功、任务状态/退款/结算逻辑变更，亦未发现本地策略实现或 no-op 兼容层残留。
