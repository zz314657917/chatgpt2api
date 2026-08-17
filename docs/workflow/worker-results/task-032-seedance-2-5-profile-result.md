### DONE: task-032-seedance-2-5-profile

# Worker Result

## Task ID
task-032-seedance-2-5-profile

## Status
`done`

## Summary
- Canvas 新增独立 `seedance-2.5` profile：七种比例、`480p/720p`、`4..30` 秒、`-1` 自动时长和 `mp4/mov`。
- Canvas 保存清理、模型切换和任务提交均按当前视频模型归一；2.5 的 30 秒不会再被旧的 15 秒上限截断。
- 后端 bridge 使用 `size`，保留 `duration=-1`，显式发送 `generate_audio=true/false`，过滤 1080p 与非法输出格式，并限制最多 30 张参考图。

## Changed Files
- `web/src/lib/api.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `internal/httpapi/video.go`
- `internal/httpapi/app_test.go`
- `docs/workflow/**`
- `output/playwright/task-032-*`

## Commands Run
```text
go test ./internal/httpapi -run "TestSub2APIVideoPayload" -count=1 -> PASS
go test ./internal/httpapi ./internal/service -count=1 -> PASS
go test ./... -> PASS
npm.cmd run lint -> PASS (2 existing beads hooks warnings, 0 errors)
npm.cmd run build -> PASS
node output/playwright/task-032-seedance-2-5-profile-smoke.mjs -> PASS
git diff --check -> PASS
```

## Test Output
```text
Canvas duration control: value=30, min=4, max=30
Canvas ratio options: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive
Canvas resolution options: auto, 480p, 720p; no 1080p/4k
Canvas POST: model=seedance-2.5, duration=-1, aspect_ratio=adaptive, resolution=720p, generate_audio=false, output_format=mov
Go payload: duration=30 and -1 preserved; 1080p/avi omitted; references capped at 30
```

## Risks
- Browser acceptance uses a local Vite instance and mocked authenticated/API responses.
- No real APIMart Token, paid generation, upstream result polling, billing, or production deployment was invoked.
- `video_urls`、`audio_urls`、`image_with_roles`、编辑/延长和素材库流程不在本 contract。

## Knowledge Candidates
- none

## Contract Compliance
- allowed_paths_only: `yes`
- denied_paths_touched: `no`
- success_criteria_met: `yes`
- stop_rules_triggered: `no`
