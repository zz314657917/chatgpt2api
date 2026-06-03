---
phase: done
current_sprint: image-composer-asset-library
total_sprints: 4
pending_action: close-image-composer-asset-library
project_type: web
qa_mode: browser
approval_required: false
last_verified: 2026-06-03
---

# Workflow Status

- 当前阶段：`build`
- 当前 Sprint：`canvas-video-and-composer-followups`
- 当前目标：把近 3 天已进入主线的 `/canvas` 视频生成节点、无 Sub2API 绑定时的视频模型 fail-closed、`/image` 分辨率预设，以及新一轮 canvas/image workflow 修复收口成当前默认 Sprint 语境。
- Task contract：暂无单独 contract；当前以近期主线提交和 `knowledge/tasks/current-task.md` 为事实源。
- 本次结论：进行中。现有 workflow status 不能再停留在 2026-05-31 的 `image-composer-asset-library done`，否则会漏掉 6 月初的新主线。
- 验证命令：
  - `cd web && npm.cmd run lint`
  - `cd web && npm.cmd run build`
  - `go test ./...`
  - `git diff --check`
- 浏览器验收：当前应至少补 `/canvas` 视频节点与 `/image` 分辨率预设的最小页面回读；是否已完成需以后续任务记录为准。
- 未完全自动化覆盖：当前状态文件尚未沉淀 6 月初这轮视频节点和 composer 预设的人工闭环。
- 下一合法动作：补当前 Sprint 的最小验证与收口记录，或补单独 contract 后继续推进。

## Previous Canvas Sprint 4

- 当前 Sprint：`canvas-sprint-004`
- 当前目标：收口图片多场景性能与当前画布未提交改动，新增中图预览、列表轻摘要和画布轻引用。
- Sprint 4 contract：`docs/workflow/sprint-04-contract.md`
- Sprint 4 结论：PASS。后端图片中图预览、列表轻摘要、详情按需读取、画布轻引用和 loop prompt 写回修复已完成。
- 验证命令：
  - `go test ./internal/service ./internal/httpapi`
  - `cd web && npm.cmd run lint`
  - `cd web && npm.cmd run build`
  - `git diff --check`
- 浏览器验收：8081 `/image-manager` 管理员“全部”视图可见本地 17 张图片；列表卡片使用 `/image-thumbnails/...`；打开预览后加载 `/image-previews/...`。
- 未完全自动化覆盖：本地图片数量未触发下一页分页，未执行真实下载动作；对应接口和字段行为已由后端/前端测试与构建覆盖。
- 下一合法动作：关闭 Sprint 4，或进入下一 Sprint Planner。
- 状态推进规则：后续 Sprint 仍按 `contract-draft -> contract-approved -> build -> qa -> fix -> retest -> done` 推进。
