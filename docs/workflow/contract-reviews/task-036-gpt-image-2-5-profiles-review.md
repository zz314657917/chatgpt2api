---
type: contract-review
scope: repository
status: approved
task_id: task-036-gpt-image-2-5-profiles
verdict: PASS
base_commit: f04f91436d2078a4b34b98d8711ef7abaa4080bf
reviewer: final-evaluator
last_verified: 2026-09-09
---

### PASS: task-036-gpt-image-2-5-profiles

# Contract Review

## Task ID
task-036-gpt-image-2-5-profiles

## Verdict
`PASS`

## Contract Checked
- `docs/workflow/tasks/task-036-gpt-image-2-5-profiles.md`

## Findings
- APIMart Markdown 文档已实时读取，两个模型共享同一字段集合，但需与旧 GPT Image 2 隔离 `xhigh/max`、尺寸规则和 `n<=4`。
- 现有代码已有 official 公共参考图上传、JSON generations 网关、输出格式/压缩和四工作台传播能力，可做模型专属复用而无需新增协议。
- Allowed Paths 覆盖模型目录、HTTP payload/校验、任务数量、共享前端参数及四入口；Denied Paths 明确排除计费、鉴权、数据库与部署。
- Acceptance 同时覆盖旧模型不回退、2.5 参数合法性、全量构建和浏览器 mock，可验证本地契约。

## Gate Checks
- success_criteria_testable: `yes`
- allowed_paths_explicit: `yes`
- denied_paths_explicit: `yes`
- acceptance_commands_executable: `yes`
- worker_model_confirmed: `yes`（codex-direct）
- base_commit_confirmed: `yes`
- openspec_traceable: `not-applicable`

## Approval
- Contract PASS，允许进入 build。
- 无真实 APIMart Token，最终不得将 mock/单测结果外推为真实生成、token 计费或生产部署已验证。
