### DONE: task-020-image-tool-text-response-hardening

# Worker Result

## Task ID
task-020-image-tool-text-response-hardening

## Status
`done`

## Summary
- Codex Responses 图片流现在识别 `response.output_text.done`、普通 `message` output item 和 `response.completed` 中的普通文本，并保留为诊断文本；只有 `image_generation_call` 才进入图片结果链路。
- `/v1/responses` image-tool 请求强制开启 text-as-error 语义，普通文本返回 `image_generation_text_response`，HTTP 层稳定映射为 400。
- generate/edit/video 的 text-only creation-task 进入 error，文本保留在 `text_response` 诊断数据中，图片消费数为 0；chat 合法文本输出保持成功语义；外部 reserve/refund 结算保持一次性幂等。
- 当前 checkout 的官方图片路由与 Codex Responses 路由未被静默改写，主模型/工具模型组合由测试锁定。

## Changed Files
- `internal/backend/responses_image.go`
- `internal/backend/backend_test.go`
- `internal/protocol/api.go`
- `internal/protocol/api_test.go`
- `internal/httpapi/app_test.go`
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`

## Commands Run
```text
go test ./internal/backend ./internal/protocol ./internal/service ./internal/httpapi -count=1 -> PASS
go test ./... -> PASS
git diff --check -> PASS（仅 Windows LF/CRLF 提示）
```

## Test Output
```text
Responses parser: image_generation_call / output_text / 普通 message / partial progress / empty completed / upstream error -> PASS
/v1/responses image-tool text-only -> HTTP 400, code=image_generation_text_response, 保留“威海旅游攻略” -> PASS
generate/edit text-only task -> error, output_statuses=error, text_response 保留 -> PASS
external billing -> reserve, refund；重复 settlement 不重复退款 -> PASS
```

## Risks
- 未执行真实账号或生产上游 capture，不能据此证明线上容器已运行本 checkout。
- Docker/旧二进制部署版本未在本轮确认；若线上仍使用旧构建，需单独核对镜像 digest、版本和出站请求日志。

## Knowledge Candidates
- none

## Contract Compliance
- allowed_paths_only: `yes`
- denied_paths_touched: `no`
- success_criteria_met: `yes`
- stop_rules_triggered: `no`

## Blocked Reason
- none
