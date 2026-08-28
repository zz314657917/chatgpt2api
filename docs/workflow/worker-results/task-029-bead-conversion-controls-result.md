### DONE: task-029-bead-conversion-controls

# Worker Result

## Task ID

task-029-bead-conversion-controls

## Status

`done`

## Summary

- 在拼豆导入面板新增精细度、抖动、平滑、主色聚类、最多色块、亮度和对比度；已有色数上限继续保留滑轨与数字输入。
- 参数写入 v1 工程文档并由前端归一化、API adapter 和 Go 服务端校验覆盖；旧文档未写入的新字段会回落到当前默认值。
- 转换链路已接入：采样精细度、Bayer 抖动、平滑去碎点、候选色聚类、连通色块收敛、亮度和对比度预处理。

## Changed Files

- `web/src/app/beads/upstream/types.ts`
- `web/src/app/beads/upstream/project.ts`
- `web/src/app/beads/upstream/image-to-beads.ts`
- `web/src/app/beads/upstream/workbench-app.tsx`
- `web/src/app/beads/upstream/upstream.css`
- `web/src/app/beads/project-adapter.ts`
- `web/src/lib/api.ts`
- `internal/service/bead_project.go`
- `internal/service/bead_project_test.go`

## Commands Run

```text
npm.cmd run lint -> PASS with 2 pre-existing workspace-canvas hook warnings
npm.cmd run build -> PASS
npm.cmd run check:bundle -> PASS; beads page 156.5 KiB, total 4568.0 KiB
go test ./internal/service ./internal/httpapi -count=1 -> PASS
go test ./... -> PASS
git diff --check -> PASS
```

## Test Output

```text
Playwright mock: local image converted from 14 colors to 1 when max color blocks was set to 1.
Playwright mock: restoring the block limit and enabling dither with brightness/contrast at +50 produced a 5-color result.
Playwright mock: persisted conversion values 73/true/3/2/987/+18/-12/64 loaded into the mobile and desktop workbench controls.
```

## Risks

- 真实账号素材上传请求不在 mock 范围；本地文件转换可用，但未验证真实对象存储。
- 本轮未构建 embedded 服务二进制、更新容器或部署。

## Knowledge Candidates

- none

## Contract Compliance

- allowed_paths_only: yes
- denied_paths_touched: no
- success_criteria_met: yes
- stop_rules_triggered: no
