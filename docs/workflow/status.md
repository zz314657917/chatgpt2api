---
phase: done
current_sprint: 4
total_sprints: 4
pending_action: close-sprint-04
project_type: web
qa_mode: browser
approval_required: false
last_verified: 2026-05-28
---

# Workflow Status

- 当前阶段：`done`
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
