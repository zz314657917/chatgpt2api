### PASS: task-031-canvas-model-contracts

# QA Report

## Task ID
task-031-canvas-model-contracts

## Verdict
`PASS`

## Contract Checked
- `docs/workflow/tasks/task-031-canvas-model-contracts.md`

## Evidence
- diff reviewed: `yes`; each Task-031 hunk is limited to the approved Canvas image-count, Canvas video-profile, video bridge, test, and workflow paths.
- allowed paths checked: `yes`
- denied paths touched: `no` for Task-031; unrelated dirty worktree changes were excluded from this review.
- commands run:
```text
go test ./internal/httpapi -run 'Test(Sub2APIVideo|Sub2APIGemini|Canvas)' -count=1 -> PASS
go test ./internal/httpapi ./internal/service -count=1 -> PASS
npm.cmd run lint -> PASS (2 pre-existing beads/upstream React hooks warnings, 0 errors)
npm.cmd run build -> PASS
node output/playwright/task-031-canvas-model-contracts-smoke.mjs -> PASS
git diff --check -> PASS
```
- manual checks:
```text
Mock Canvas: saved Gemini Flash node with n=4 rendered a disabled one-image control -> PASS
Mock Canvas: Gemini Flash generation request was captured with n=1 -> PASS
Mock Canvas: saved unsupported video model displayed a parameter-contract warning and disabled video submission -> PASS
Mock Canvas: video selector exposed Seedance 2.0 and did not expose Sora 2 -> PASS
Screenshot: output/playwright/task-031-canvas-model-contracts.png visually confirmed the control and disabled state -> PASS
```

## Findings
- 未发现明确问题。

## Unverified Risks
- 未启动 embedded service，也没有真实登录态、Sub2API 绑定或上游账号；本报告不验证真实视频生成和 APIMart 计费/返回格式。
- 任务 contract 明确不包含 `official_fallback` Canvas 控件和 Apimart 兼容模型别名。

## Bug Owner Recommendation
`none`

## Root Cause
`none`

## Retest Scope
- none

## Knowledge Promotion
- `none`
