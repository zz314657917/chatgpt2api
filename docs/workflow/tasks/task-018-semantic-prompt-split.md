---
task_id: task-018-semantic-prompt-split
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-13
---

# Task 018: Semantic Prompt Split

## Role

Generator

## Goal

让 prompt-split 先识别颜色、角度、材质、场景或风格等主要变化维度，再生成恰好 `split_count` 条单变体、自包含的最终生图提示词。

## Success Criteria

- splitter 严格返回 `variation_axis + items[{variant_label,prompt}]`，服务端校验唯一性、非空、数量和额外字段。
- “5 个颜色的陶瓷瓶子”在 `split_count=5` 时得到 5 个单色变体；`split_count=4` 时节点数量优先，只得到 4 个变体。
- 用户明确要求“一张图/同框/一组”时保留群组语义，不错误拆成单主体。
- 批次和 item 持久化语义元数据，详情弹窗显示变化维度和变体标签，mini 节点高度不变化。
- direct 模式仍固定每项 `n=1`，解析失败仍不创建图片子任务，不增加第二次 chat 调用。

## Allowed Paths

- `internal/service/prompt_split.go`
- `internal/service/prompt_split_test.go`
- `internal/httpapi/prompt_split_test.go`
- `web/src/lib/api.ts`
- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `docs/workflow/**`

## Denied Paths

- 数据库、部署配置、Sub2API、计费协议和其它 creation-task API。
- `knowledge/**`、素材侧栏和其它工作台。
- 新依赖、额外模型调用、自动重试或自动覆盖节点拆分数量。

## Constraints

- `POST /prompt-splits` 请求不变，`split_count` 是最终数量真源。
- response 可新增 `variation_axis` 和 item `variant_label`；旧持久化批次不迁移，缺字段时自然显示原列表。
- 现有 Task-017 失败重试修复必须保留，素材侧栏 dirty changes 不得混入。

## Acceptance Commands

```powershell
go test ./internal/service ./internal/httpapi
go test ./...
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs
```

## Output

- `docs/workflow/worker-results/task-018-semantic-prompt-split-result.md`
- `docs/workflow/qa-reports/task-018-semantic-prompt-split-qa.md`
- 更新 `docs/workflow/status.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 需要改变图片任务计费、鉴权、Sub2API 或 direct `n=1` 时停止。
- 无法保持严格结构化解析与解析失败零子任务时停止并回 Planner。
