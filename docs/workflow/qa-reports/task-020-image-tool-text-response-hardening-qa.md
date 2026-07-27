### PASS: task-020-image-tool-text-response-hardening

# QA Report

## Task ID
task-020-image-tool-text-response-hardening

## Verdict
`PASS`

## Contract Checked
- `docs/workflow/tasks/task-020-image-tool-text-response-hardening.md`

## Evidence
- diff reviewed: `yes`
- allowed paths checked: `yes`
- denied paths touched: `no`
- commands run:
```text
go test ./internal/backend ./internal/protocol ./internal/service ./internal/httpapi -count=1 -> PASS
go test ./... -> PASS
git diff --check -> PASS（仅 Windows LF/CRLF 提示）
```
- manual checks:
```text
路由矩阵：gpt-5.4-mini / gpt-image-2 / codex-gpt-image-2 的主模型、工具模型和实际路由由测试锁定 -> PASS
Codex 出站 payload：model、tools、tool_choice、instructions 可观察 -> PASS
Responses 事件：真实 image_generation_call、最终普通文本、进度、空 completed、upstream error -> PASS
HTTP：/v1/responses image-tool 普通文本返回 400 和 image_generation_text_response，并保留原文 -> PASS
任务/计费：generate/edit text-only 为 error、图片消费 0、reserve/refund 只发生一次；chat 文本保持成功 -> PASS
```

## Findings
- 未发现明确问题。
- 本轮修复只改变强制生图分支的 text-only 归一；普通 chat 文本和既有图片成功输出测试均通过。

## Bug Owner Recommendation
`original-worker`

## Root Cause
`none`

## Retest Scope
- 如后续修改 Responses 事件解析或任务结算，最小重测范围为 backend parser、protocol image-tool、httpapi `/v1/responses`、service text-only/refund 四组测试。

## Knowledge Promotion
`none`

## Unverified Risks
- 未执行真实账号、真实上游或生产容器验证；需部署后用脱敏 capture 确认实际版本和出站 payload。
- 线上若运行旧二进制，仍可能保留旧的文本降级行为；本报告只对当前 checkout 负责。

## Recommendation
- Task-020 代码级验收通过，可以进入部署验证；部署前先确认镜像/二进制版本，再补一条真实或脱敏上游 capture。
