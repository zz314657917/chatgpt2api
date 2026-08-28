### PASS: task-035-seedream-image-profiles

# QA Report

## Task ID
task-035-seedream-image-profiles

## Verdict
`PASS`

## Contract Checked
- `docs/workflow/tasks/task-035-seedream-image-profiles.md`
- `docs/workflow/task-035-contract-review.md`（含 Amendment 1）

## Evidence
- diff reviewed: `yes`
- allowed paths checked: `yes`
- denied paths touched: `no`
- commands run: 定向 Go、相关包 Go、`go test ./...`（最终复测含非法 sequential 模式）、`npm.cmd run lint`、`npm.cmd run build`、Task-035 Allowed Paths `git diff --check`：全部 PASS。
- manual checks: 图片页和 Canvas 四模型 profile、分辨率/格式/数量控件、Lite n=15 单任务请求、Pro 固定 n=1 均 PASS。

## Findings
- 未发现明确问题。
- 浏览器 mock 请求确认无 `quality`、Gemini 搜索或 Grok 字段；Lite 请求带 `sequential_image_generation=auto` 与 `max_images`，默认单图设置显示关闭。
- 工作区存在其它 Sprint 与用户改动；本 QA 只裁决 Task-035 允许 hunk，未回滚或吸收无关改动。

## Bug Owner Recommendation
`original-worker`

## Root Cause
`none`

## Retest Scope
- N/A（PASS）

## Unverified Risks
- 没有真实 APIMart Token/付费额度，不能宣称真实供应商生成、审核、计费或生产部署已验证。
- 未验证运行中服务版本。

## Knowledge Promotion
`none`

## Contract Compliance
`PASS`。未触碰 Sub2API、计费、鉴权、数据库、部署或 Docker；4.x bridge ID 保持不变，Pro deferred 能力未暴露。
