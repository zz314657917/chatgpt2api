# Task 032: Seedance 2.5 Canvas Profile

## Task ID
task-032-seedance-2-5-profile

## Role
在 P/G/E 流程中按 APIMart 当前文档实现 Seedance 2.5 的 Canvas 视频参数契约。仅执行本 contract，不扩展到视频编辑、延长、素材库、计费或部署。

## Goal
使无限画布能够选择并正确提交 `seedance-2.5`，且前后端参数与 APIMart `POST /v1/videos/generations` 文档一致，不复用 Seedance 2.0 的时长、分辨率或默认字段。

## Success Criteria
- Canvas 将 `seedance-2.5` 识别为受支持视频模型。
- Canvas 仅为该模型提供 `16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`21:9`、`adaptive`，以及 `480p`、`720p` 分辨率。
- Canvas 可保存并提交 `4..30` 秒，切换到该模型时不会被旧的 `5..15` 秒清理规则截断。
- Canvas 可选择 `mp4` 或 `mov`；其它没有该能力声明的模型不发送 `output_format`。
- 后端 `seedance-2.5` profile 使用 `size`、保留 `duration=-1`、限制普通时长到 `4..30`、限制分辨率到 `480p/720p`、最多传递 30 张参考图，并显式发送 `generate_audio` 布尔值。
- 定向测试覆盖 30 秒、`-1` 自动时长、非法 1080p、`mov`、无声请求和参考图上限。

## Evidence
- APIMart 文档：`https://docs.apimart.ai/cn/api-reference/videos/seedance-2-5/generation`
- 文档模型固定值：`seedance-2.5`。
- 文档端点：`POST /v1/videos/generations`。
- 文档约束：`size` 支持七种比例；`resolution` 仅 `480p/720p`；`duration` 为 `4..30` 或 `-1`；`generate_audio` 默认 `true`；`output_format` 为 `mp4/mov`；参考图最多 30 张。

## Allowed Paths
- `web/src/lib/api.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `internal/httpapi/video.go`
- `internal/httpapi/app_test.go`
- `docs/workflow/**`
- `output/playwright/task-032-*`

## Denied Paths
- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- `deploy/**`、Docker 配置、Sub2API 计费/鉴权、数据库迁移、素材库 API。

## Constraints
- 仅添加文档中的规范模型 ID `seedance-2.5`，不增加 `doubao-seedance-2.5` 等别名。
- 不把 2.0 的 `1080p` 或 `5..15` 秒规则复用到 2.5。
- 不在本 Sprint 增加 `video_urls`、`audio_urls`、`image_with_roles`、视频编辑、视频延长、素材入库或联网搜索 UI。
- `output_format` 使用独立的视频字段，不能污染图片节点的 `output_format` 类型和语义。
- 不回滚或覆盖工作区既有改动。

## Acceptance Commands
```powershell
go test ./internal/httpapi -run "TestSub2APIVideoPayload" -count=1
go test ./internal/httpapi ./internal/service -count=1
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
git diff --check
```

## Output
- `docs/workflow/worker-results/task-032-seedance-2-5-profile-result.md`
- `docs/workflow/qa-reports/task-032-seedance-2-5-profile-qa.md`

## Stop Rules
- 文档与实际模型目录出现冲突时，停止并记录具体模型 ID/字段差异。
- 如需修改计费、鉴权、数据库、部署或素材库协议，停止并回 Planner。
- 如实现必须新增视频/音频上传或编辑工作流，另建 contract。
