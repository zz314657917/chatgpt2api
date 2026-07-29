---
task_id: task-022-generator-style-actions-layout
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-29
---

# Task 022: Generator Style Actions Layout

## Role

Generator

## Goal

将 Canvas 图片生成节点 full 模式的复制样式、粘贴样式和收起参数从 Prompts 上方的独占工具条移到参数区底部，形成紧凑且随节点宽度适配的样式操作栏。

## Success Criteria

- full 模式在 Prompts 之前不再渲染复制、粘贴或收起参数操作行。
- 样式操作栏位于模型、普通参数或 Pro Studio 参数之后，并与输出预览保持适当分隔。
- 保留复制样式和粘贴样式的 `aria-label`、`title`、禁用条件与既有回调，收起参数继续切回 compact 模式。
- 窄节点下控件可自然换行，不出现横向溢出、遮挡或额外滚动容器。
- Task-021 的自动高度、参数区 wheel 隔离、无内部纵向滚动和 compact 模式语义不变。

## Allowed Paths

- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- `docs/workflow/**`

## Denied Paths

- 后端 API、Sub2API、计费、Canvas schema、任务编排与持久化字段。
- `web/src/app/canvas/use-smart-canvas-controller.ts` 中的样式复制或粘贴语义。
- 其它节点类型、新依赖、Docker 与部署配置。
- `knowledge/**`。

## Constraints

- 不恢复任何参数内部滚动容器，也不通过缩小字体或 CSS transform 压缩控件。
- 图标按钮继续提供可访问名称和 hover 提示；文字操作只用于明确命令。
- 保留当前工作区的未提交 `knowledge/00-start-here.md` 以及 `.codex-*` 本地产物。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
```

## Output

- `docs/workflow/worker-results/task-022-generator-style-actions-layout-result.md`
- `docs/workflow/qa-reports/task-022-generator-style-actions-layout-qa.md`
- 更新 `docs/workflow/status.md`、`docs/workflow/spec.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 如需修改复制/粘贴数据、任务请求、Canvas schema、后端或 Sub2API，停止并回 Planner。
- 如无法在窄节点同时保持可读性、无横向溢出与 Task-021 wheel 行为，停止并重新设计布局。
