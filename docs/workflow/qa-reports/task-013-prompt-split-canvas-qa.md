### FAIL: task-013-prompt-split-canvas

## Findings

- P1: 服务进程重启后，已经提交到底层 creation task 的 prompt-split child 不能被安全续跑。当前行为会保留已成功项，但无法恢复已运行底层任务；这不满足本 Sprint 的服务重启恢复验收，因而 P/G/E 终态为 FAIL。

## Executed Checks

- `node docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`: PASS，6/6。使用全路由 mock 和当前 Vite 源码验证：desktop mini LLM 节点、nodes 3 组独立 generator/result 且无 image-generation POST、direct 3 个唯一 child ID 与成功轮询、Pro Studio `1k/2k/4k` 前端 payload 均保留 `n: 1`、完成 batch 缺失 fanout 后一次 GET+sync 重建、一次 503 后保留原 batch 并重试、390x844 下直接生图和 10 条数量无横向溢出。
- `go test ./internal/httpapi -run PromptSplit -count=1`: PASS，真实 direct endpoint 覆盖 Pro Studio `1k/2k/4k`，并验证子任务固定 `n=1`、official model、resolution metadata 与 official settings。
- `go test ./internal/service -run PromptSplit -count=1`: PASS。
- `node --check docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`: PASS。
- `git diff --check -- docs/workflow/evidence/task-013-prompt-split-canvas/browser-smoke.cjs`: PASS。QA 新增脚本和截图只追溯到本任务的浏览器验收要求。
- 浏览器证据：`output/playwright/task-013-prompt-split-canvas/browser-smoke-result.json`，以及 desktop nodes/direct、Pro Studio 4K、fanout recovery、transient recovery 和 mobile 截图。

## Unverified Risks

- browser smoke 使用全路由 mock，不覆盖真实鉴权、Sub2API reserve/commit/refund、上游模型或生产网络。
- 服务重启后已运行底层任务的恢复是明确未通过项，不应把本报告解读为完整 PASS。

## Recommendation

- 需修复：先定义并实现“已运行底层 task”在服务重启后的可查询/恢复策略，再补对应 service + HTTP + browser 回归。完成后重新执行本报告中的全部检查。
