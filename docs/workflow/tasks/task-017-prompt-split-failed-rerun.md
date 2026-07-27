---
task_id: task-017-prompt-split-failed-rerun
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-12
---

# Task 017: Prompt Split Failed Rerun

## Role

Generator

## Goal

修复提示词拆分在 `0/N` 失败后仍弹出“如何处理上一批节点”的误判；只有画布上确实存在该批次 fan-out 节点时才询问保留或替换。

## Success Criteria

- 失败批次只有 batch ID、没有 fan-out 节点时，再次点击直接提交新拆分。
- 失败重试不弹“如何处理上一批节点”，也不写入 `prompt_split_replace_batch_id`。
- 成功批次存在图片生成/Output 节点时，重跑仍显示保留、替换和取消选择。
- 不改变后端 API、拆分状态、计费、直接生图或批次恢复语义。

## Allowed Paths

- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`
- `docs/workflow/**`

## Denied Paths

- 后端、数据库、部署配置、Sub2API 和计费。
- `knowledge/**`、素材侧栏和其它工作台。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
```

## Stop Rules

- 需要修改后端批次协议或删除失败批次持久化信息时停止。
- 无法在保留成功批次重跑弹窗的同时修复失败重试时停止并重新设计判定边界。
