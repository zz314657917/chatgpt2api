### PASS: task-008-pro-studio-v1

# QA Report

## Task ID
task-008-pro-studio-v1

## Verdict
`PASS`

## Contract Checked
- `docs/workflow/tasks/task-008-pro-studio-v1.md`

## Evidence
- diff reviewed: `yes`
- allowed paths checked: `yes`
- denied paths touched: `no`
- commands run:
```text
go test ./internal/service -run 'Test(ImageServiceImageDetailReturnsProStudioMetadata|ImageTaskServicePreservesProStudioMetadata|NormalizeProStudioRequest|ValidateProStudioRequest)' -count=1 -> pass
go test ./internal/httpapi -run 'TestCreationTaskProStudio' -count=1 -> pass
go test ./internal/service ./internal/httpapi -count=1 -> pass
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint" -> pass
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build" -> pass
go test ./... -> pass
```
- manual checks:
```text
/canvas loaded authenticated app shell and base canvas nodes -> pass
/canvas production mode toggle visible and usable -> pass
/canvas production mode shows 用途, 等级, 高级 official 设置, gpt-image-2-official lock -> pass
/ecommerce-suite loaded workbench and project creation -> pass
/ecommerce-suite production mode toggle visible and usable -> pass
/ecommerce-suite production mode shows 商品主图, 电商横幅, 详情页竖图, 场景图, SKU 批量图 -> pass
/ecommerce-suite SKU 8 preview -> 2 tasks: 4 + 4 -> pass
/ecommerce-suite SKU 12 preview -> 3 tasks: 4 + 4 + 4 -> pass
Screenshots:
  output/playwright/pro-studio-canvas-production-mode.png
  output/playwright/pro-studio-ecommerce-smoke.png
  output/playwright/pro-studio-ecommerce-sku-batch-smoke.png
```

## Findings
- 未发现明确问题。
- 未做真实上游图片生成和真实 Sub2API 支付/扣费 E2E，保留为生产联调风险。

## Bug Owner Recommendation
`original-worker`

## Root Cause
- `none`

## Retest Scope
- 若后续修改 Pro Studio payload、creation-task、Canvas/Ecommerce 生成入口或 metadata 字段，至少重跑：
  - `go test ./internal/service ./internal/httpapi -count=1`
  - `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"`
  - `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"`
  - Canvas / Ecommerce Pro Studio browser smoke。

## Knowledge Promotion
- `candidate`
- 候选：official Pro Studio resolution metadata 保留 `1k|2k|4k`；JPEG/WebP 可带 compression，PNG 不带；Ecommerce 批量按 `n<=4` 拆任务。
