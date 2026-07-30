---
task_id: task-023-image-manager-bulk-download-action
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-29
---

# Task 023: Image Manager Bulk Download Action

## Role

Generator

## Goal

在素材库选中多张图片时，显示直接可见的“批量下载 (N)”按钮，并复用现有的受鉴权多文件下载流程。

## Success Criteria

- 当前列表选中两张或以上图片时，右下角操作区直接显示“批量下载 (N)”按钮；选中一张或零张时不显示。
- 点击按钮调用现有 `downloadItems("selected", selectedItems)`，继续逐张使用 `/api/images/download-url`、当前 gallery scope 和团队 ID；下载中的 loading/禁用状态与现有操作一致。
- 单图详情下载、弹层内“下载已选”、下载已加载、全选、筛选、归类、删除与素材权限不改变。
- 桌面和窄屏操作区不重叠、不横向溢出，按钮具有清晰文本和可访问名称。

## Allowed Paths

- `web/src/app/image-manager/page.tsx`
- `docs/workflow/**`

## Denied Paths

- 后端 API、对象存储、下载签名、鉴权、计费、Sub2API、数据库与部署配置。
- `web/src/app/ecommerce-suite/**`、Canvas、素材库 schema 与其他素材类型页面。
- `knowledge/**`。

## Constraints

- 不新增第三方依赖，不添加 ZIP、服务端打包或多文件下载替代链路。
- 批量下载必须复用既有下载函数，不能以静态 URL、原始对象地址或未鉴权 fetch 绕过下载权限。
- 不修改或暂存现有 `knowledge/00-start-here.md` 和 `.codex-*` 本地产物。
- 不引入新的滚动容器、固定尺寸溢出或无文字图标按钮。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
git diff --check
```

## Browser QA Scenarios

- 准备至少两张素材后逐张选择，确认“批量下载 (2)”直接可见，且操作弹层仍可正常打开。
- 点击批量下载，确认两个受鉴权下载请求使用当前 scope；下载中按钮显示 loading 且避免重复触发。
- 取消选择至一张或零张，确认批量下载按钮消失；单图下载和“下载已选”仍可用。
- 在 390px 宽度下确认批量下载与“操作”按钮不遮挡，截图保存到 `output/playwright/`。

## Output

- `docs/workflow/task-023-contract-review.md`
- `docs/workflow/worker-results/task-023-image-manager-bulk-download-action-result.md`
- `docs/workflow/qa-reports/task-023-image-manager-bulk-download-action-qa.md`
- 更新 `docs/workflow/status.md`、`docs/workflow/spec.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 如现有 `downloadItems` 无法满足当前 scope 或需要修改下载签名、后端、对象存储、ZIP/压缩实现，停止并回 Planner。
- 如窄屏下无法同时保持明确操作入口和无重叠布局，停止并重新设计布局。
