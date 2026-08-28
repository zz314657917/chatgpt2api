### DONE: task-035-seedream-image-profiles

# Worker Result

## Task ID
task-035-seedream-image-profiles

## Status
`done`

## Summary
- 完成 Seedream 4.0、4.5、5.0 Lite、5.0 Pro 独立模型 profile、后端校验和图片页/Canvas/电商套图/Image Arena 参数传播。
- 4.0 支持 1K/2K/4K，4.5 支持 2K/4K，4.x/Lite 支持最多 15 张；Lite 支持 2K/3K/4K、PNG/JPEG 与组图；Pro 固定 n=1、最多 10 张参考图、1K/1.5K/2K、PNG/JPEG。
- 4.x 保持 `doubao-seedance-4-0/4-5` bridge ID，5.0 使用 `seedream-5-0-lite/pro`；未添加 fallback，未修改 Sub2API。
- 单图默认 sequential 为 `disabled`；多图最终归一为 `auto` 并保留 `max_images`，Pro 不发送 sequential 字段。

## Changed Files
- `internal/httpapi/sub2api.go`
- `internal/httpapi/image_gateway_models_test.go`
- `internal/httpapi/app.go`
- `internal/httpapi/app_test.go`
- `internal/httpapi/routes.go`
- `internal/httpapi/canvas.go`
- `internal/service/image_task.go`
- `internal/service/image_task_test.go`
- `internal/util/json.go`
- `internal/util/image_models_test.go`
- `web/src/lib/api.ts`
- `web/src/lib/api.assert.ts`
- `web/src/lib/image-parameters.ts`
- `web/src/lib/image-model-settings.ts`
- `web/src/lib/image-model-settings.assert.ts`
- `web/src/components/image-model-settings-button.tsx`
- `web/src/components/image-output-controls.tsx`
- `web/src/app/image/page.tsx`
- `web/src/app/image/components/image-composer.tsx`
- `web/src/app/image/components/image-arena-composer.tsx`
- `web/src/app/image/image-options.assert.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/canvas-utils.assert.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/lib/image-arena/image-arena-adapter.ts`
- `web/src/lib/image-arena/image-arena-agents.ts`
- `web/src/lib/image-arena/image-arena-agents.assert.ts`
- `web/src/lib/image-arena/image-arena.assert.ts`
- `web/src/lib/image-arena/image-arena-model-capabilities.ts`
- `web/src/store/image-conversations.ts`
- `web/src/store/ecommerce-suite-projects.ts`

## Commands Run
```text
go test ./internal/httpapi -run "Test.*(Seedream|CanvasImageModel)" -count=1 -> PASS
go test ./internal/service ./internal/util -run "Test.*(Seedream|ImageTaskCount|ImageGenerationModel)" -count=1 -> PASS
go test ./internal/httpapi ./internal/service ./internal/util -count=1 -> PASS
go test ./... -> PASS
cd web; npm.cmd run lint -> PASS (0 error; 2 existing beads hooks warnings)
cd web; npm.cmd run build -> PASS
git diff --check -- Task-035 Allowed Paths -> PASS (only LF/CRLF notices)
node E:/task035-seedream-browser.mjs -> PASS
node E:/task035-seedream-canvas-browser.mjs -> PASS
```

## Test Output
```text
Go targeted/package/full: PASS
Frontend lint: 0 errors; 2 pre-existing beads hooks warnings
Frontend build: TypeScript, Vite and compression PASS; 63 assets precompressed
Browser image: four profiles visible; Lite n=15 is one task with sequential auto/max_images=15
Browser Canvas: 4.0 [1K,2K,4K], 4.5 [2K,4K], Lite [2K,3K,4K], Pro [1K,1.5K,2K]; Lite n=15 is one task
```

## Risks
- 未使用真实 APIMart Token/付费额度；真实排队、审核、图片产物、供应商报价和计费未验证。
- 未构建 embedded binary、未更新 Docker、未部署，不能推断运行实例已生效。

## Knowledge Candidates
- None。供应商参数属于时效性 Task-035 契约，已记录在 workflow 文档。

## Contract Compliance
- allowed_paths_only: `yes`
- denied_paths_touched: `no`
- success_criteria_met: `yes`
- stop_rules_triggered: `no`

## Blocked Reason
- N/A
