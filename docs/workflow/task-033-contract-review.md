### PASS: task-033-remove-local-image-content-policy

# Task 033 Contract Review

## Verdict
`PASS`

## Findings
- 用户明确要求移除截图所示判定，contract 将授权限制为本地关键词预审及其调用链，不扩大到上游供应商策略绕过。
- 根因已有源码证据：本地归一化删除空格后，`desktop ornament` 跨词边界误形成 `porn`，说明当前子串策略会误伤普通商品提示词。
- Allowed Paths 覆盖全部本地预审调用、策略实现和对应测试；前端、HTTP 路由、计费、鉴权、数据库、部署与知识库均被明确排除。
- Contract 要求删除无用实现而不是保留恒定放行的兼容层，符合仓库“当前 API、无兼容层”的原则。
- 上游 content policy 错误归一和中文展示被明确保留，避免把“移除本地预审”错误扩大为吞掉上游真实失败。
- 验收覆盖定向 service/protocol、相关包、全量 Go 测试和允许路径差异检查，足以验证后端行为且不要求生产部署。

## Risks Carried Forward
- 上游供应商仍可能根据自身策略拒绝请求；本 task 不承诺任何提示词都能由上游成功生成。
- 移除本地预审后，请求会在进入上游前继续经过现有鉴权、限流、预扣和任务流程，但不再由本仓库按成人/暴力关键词提前拒绝。
- 本轮不更新 Docker 或运行中的服务，源码修复需要后续构建/部署才会影响现有实例。

## Amendment 1: HTTP API Regression Assertions
- 三包验收证明 `internal/httpapi/app_test.go` 有 3 个既有测试仍断言本地关键词必须拒绝；这些断言与已批准的新语义冲突，但不需要修改生产 HTTP handler。
- Allowed Paths 增加 `internal/httpapi/app_test.go`，仅用于把这 3 个旧断言改为请求进入既有执行链路的回归；`internal/httpapi` 其它路径仍保持 Denied。
- 修订不扩大运行时代码范围，Evaluator 判定 `PASS`，原 Developer Worker 可继续修复测试并重跑。

## Amendment 2: Social Partial-Failure Fixture
- 全量测试进一步发现 `TestSocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure` 间接使用“血腥肢解”触发第二项本地拒绝；移除预审后该夹具不再制造部分失败。
- 允许在同一 `internal/httpapi/app_test.go` 内把该测试改为通过既有任务限制或测试 handler 注入第二项失败，必须继续验证第一项已提交任务被取消、partial task 持久化和 cancel error 为空。
- 仍不允许修改任何生产 HTTP 或 service 代码；Evaluator 判定 `PASS`。
