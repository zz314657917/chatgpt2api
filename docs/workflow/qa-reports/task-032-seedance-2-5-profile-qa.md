### PASS: task-032-seedance-2-5-profile

# QA Report

## Task ID
task-032-seedance-2-5-profile

## Verdict
`PASS`

## Contract Checked
- `docs/workflow/tasks/task-032-seedance-2-5-profile.md`

## Evidence
- APIMart 文档核对：`https://docs.apimart.ai/cn/api-reference/videos/seedance-2-5/generation`。
- diff reviewed: `yes`; Task-032 业务 hunk 仅涉及批准的 Canvas profile/类型/提交层、视频 bridge 和测试。
- allowed paths checked: `yes`
- denied paths touched: `no`; 工作区其它既有改动未纳入本 Task，也未回滚。
- commands run:
```text
go test ./internal/httpapi -run "TestSub2APIVideoPayload" -count=1 -> PASS
go test ./internal/httpapi ./internal/service -count=1 -> PASS
go test ./... -> PASS
npm.cmd run lint -> PASS (2 pre-existing beads/upstream React hooks warnings, 0 errors)
npm.cmd run build -> PASS
node output/playwright/task-032-seedance-2-5-profile-smoke.mjs -> PASS
git diff --check -> PASS
```
- browser checks:
```text
Seedance 2.5 node rendered duration 30 with min=4/max=30 -> PASS
Ratio menu exposed seven documented values -> PASS
Resolution menu exposed auto/480p/720p and excluded 1080p/4K -> PASS
Automatic duration toggle submitted duration=-1 -> PASS
MOV selector submitted output_format=mov -> PASS
Audio disabled submitted generate_audio=false -> PASS
Screenshot: output/playwright/task-032-seedance-2-5-profile.png -> PASS
```

## Findings
- 未发现明确问题。

## Unverified Risks
- 未使用真实 APIMart Token 发起付费生成，因此不验证真实排队耗时、30 秒产物、音轨、MOV 文件或计费结果。
- Canvas 尚未实现参考视频、参考音频、首尾帧角色、视频编辑/延长、私域素材和联网搜索；这些能力已明确排除在 Task-032 外。

## Bug Owner Recommendation
`none`

## Root Cause
`none`

## Retest Scope
- none

## Knowledge Promotion
- `none`
