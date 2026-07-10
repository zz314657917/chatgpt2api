# Task Contract

## Task ID
studio-bridge-model-scoped-apimart-billing

## Role
Codex 作为 Generator 实现，Evaluator 独立审查 contract、diff 和验收证据；本任务不调用 worker。

## Goal
在图片任务结算层禁止固定价 `gpt-image-2` 使用 APIMart 实际成本覆盖。普通 `gpt-image-2` 无论任务状态是否返回上游 cost，都继续使用提交时的固定产品价格；official 及其他成本型 APIMart 模型保持现有结算。

## Success Criteria
- 普通 `gpt-image-2` 的成功任务只 reserve/commit 固定预扣金额，忽略 `apimart_cost` 成本覆盖。
- 普通模型的高于或低于固定价两种上游成本都不触发 surcharge/refund。
- `gpt-image-2-official` 继续按 APIMart 实际成本与固定预扣的差额结算。
- Midjourney、Grok 等已有成本型模型继续使用 APIMart 实际成本，不发生计费回退。
- 本地 `billing_consumed_amount` 与实际发往 Sub2API 的普通模型固定结算一致。

## Context
- Executor repo: `F:/java/chatgpt2api`
- Ledger repo: `F:/mcplugins/sub2api`
- Related contract: `F:/mcplugins/sub2api/docs/workflow/tasks/studio-bridge-model-scoped-apimart-billing.md`
- Deployment order: this executor policy before the Sub2API validation guard.

## Allowed Paths
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`
- `docs/workflow/tasks/studio-bridge-model-scoped-apimart-billing.md`
- `docs/workflow/qa-reports/studio-bridge-model-scoped-apimart-billing-qa.md`
- `docs/workflow/main-log.md`

## Denied Paths
- `docs/workflow/status.md` and existing dirty Canvas/knowledge files.
- `internal/httpapi/**`, storage schema, production config, deploy files and frontend files.
- Any path in `F:/mcplugins/sub2api` except that repo's mirrored contract.

## Constraints
- Make the billing decision from the resolved external billing model stored on the task.
- Preserve upstream cost fields for diagnostics, but do not let them change ordinary-model balance settlement.
- Do not add compatibility layers or historical charge repair.
- Preserve unrelated working-tree changes.

## Acceptance Commands
```powershell
go test ./internal/service -run 'TestImageTaskService(ExternalBillingIgnoresAPIMartCostOverrideForGPTImage2|ExternalBillingUsesTaskStatusCostOverride|ExternalBillingKeepsEstimatedBalanceUnit|AutoImageModelUsesResolvedBridgeCostModel)$' -count=1
go test ./internal/service ./internal/httpapi -count=1
git diff --check -- internal/service/image_task.go internal/service/image_task_test.go
```

## Output
- QA evidence: `docs/workflow/qa-reports/studio-bridge-model-scoped-apimart-billing-qa.md`.
- Final verdict must be `PASS`, `FAIL` or `BLOCKED` with cross-repo evidence.

## Stop Rules
- Stop if the fix requires changing the HTTP bridge payload, storage format, production config or unrelated dirty files.
- Stop if the resolved task model is unavailable at settlement time.

## Contract Review
- Verdict: approved.
- The stored external billing model is available before settlement and is sufficient to gate actual-cost overrides.
- Focused tests must cover both higher and lower APIMart costs for ordinary `gpt-image-2`.
