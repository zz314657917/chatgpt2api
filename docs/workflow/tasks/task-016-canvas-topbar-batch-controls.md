---
task_id: task-016-canvas-topbar-batch-controls
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-12
---

# Task 016: Canvas Topbar Batch Controls

## Role

Generator

## Goal

把 prompt-split 批次控制从画布内第二行浮层移入桌面顶部工具栏，放在节点创建按钮组左侧，释放画布顶部空间并保持批次高亮联动。

## Success Criteria

- 桌面端批次控制与顶部节点按钮处于同一工具栏层级，批次控制位于“上传”按钮左侧。
- 画布内不再渲染 `top-[68px]` 的独立批次浮层。
- 批次切换、定位、整理、删除确认和节点高亮行为保持不变。
- 顶部宽度不足时批次状态逐级压缩，不覆盖节点按钮、历史/保存控件或画布标题。
- 移动端不新增顶部横向溢出，继续保持现有单按钮工具入口。
- 纯布局与批次操作不提交 prompt-split 或图片任务。

## Allowed Paths

- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/app/canvas/page.tsx`
- `docs/workflow/**`

## Denied Paths

- 后端、数据库、迁移、部署配置、Sub2API、计费和 creation-task API。
- Canvas 节点排布算法、节点尺寸、任务状态和 prompt-split 执行语义。
- 素材侧栏、`knowledge/**`、全局 memories、新依赖。

## Constraints

- 当前批次状态必须由 TopBar 与 Board 共享，不用 DOM 查询或固定像素猜测另一控件宽度。
- 不增加新的节点数据持久化字段。
- 删除活动批次仍应被禁止；删除确认文案保持明确。
- 不恢复已经取消的“向下单列排布”改动。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
node docs/workflow/evidence/task-016-canvas-topbar-batch-controls/browser-smoke.cjs
```

## Browser QA Scenarios

- 1600px 桌面端批次控件位于“上传”左侧，垂直边界与顶部按钮对齐，画布内没有第二行批次浮层。
- 1365px 桌面端顶部控件互不覆盖且页面无横向溢出。
- 批次前后切换、高亮、定位、整理、删除取消/确认继续正常且零任务请求。
- 390px 移动端无横向溢出，现有移动工具按钮仍可用。

## Output

- `docs/workflow/worker-results/task-016-canvas-topbar-batch-controls-result.md`
- `docs/workflow/qa-reports/task-016-canvas-topbar-batch-controls-qa.md`
- 更新 `docs/workflow/status.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要修改后端或任务语义时停止。
- 需要硬编码依赖另一工具栏实时宽度才能定位时停止并回 Planner。
- 桌面端只能通过覆盖其他控件才能放入同一行时停止并重新设计压缩规则。
