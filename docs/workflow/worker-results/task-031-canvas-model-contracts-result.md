### DONE: task-031-canvas-model-contracts

# Worker Result

## Task ID
task-031-canvas-model-contracts

## Status
`done`

## Summary
- Gemini Flash 和 Gemini Flash Official 的提交数量统一经 `imageTaskSubmitCount` 收口为 `n=1`；Canvas 张数控件同步锁定为单张。
- Canvas 视频 profile 提升到共享 `canvas-utils.ts`，下拉只显示已有 profile 的模型；已保存的未知视频模型会提示并禁止提交。
- Sub2API 视频 bridge 移除未知模型的 Seedance 默认值，未知模型返回明确错误且不会请求上游。

## Changed Files
- `web/src/lib/api.ts`
- `web/src/lib/api.assert.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `internal/httpapi/video.go`
- `internal/httpapi/app_test.go`
- `docs/workflow/**`

## Commands Run
```text
go test ./internal/httpapi -run 'Test(Sub2APIVideo|Sub2APIGemini|Canvas)' -count=1 -> PASS
go test ./internal/httpapi ./internal/service -count=1 -> PASS
npm.cmd run lint -> PASS (2 existing beads hooks warnings, 0 errors)
npm.cmd run build -> PASS
node output/playwright/task-031-canvas-model-contracts-smoke.mjs -> PASS
git diff --check -> PASS
```

## Test Output
```text
Gemini Flash Canvas control: value=1, disabled=true
Gemini Flash image-generation POST: model=gemini-3.1-flash-image-preview, n=1
Saved sora-2 video node: warning=true, submit disabled=true
Video model menu: Seedance 2.0 only; Sora 2 absent
```

## Risks
- Browser acceptance uses a local Vite instance and mocked authenticated/API responses.
- No real Sub2API account, upstream gateway, or production deployment was invoked.

## Knowledge Candidates
- none

## Contract Compliance
- allowed_paths_only: `yes`
- denied_paths_touched: `no`
- success_criteria_met: `yes`
- stop_rules_triggered: `no`
