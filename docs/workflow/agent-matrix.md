---
repo: chatgpt2api
project_type: web
qa_mode: browser
last_verified: 2026-05-26
---

# Agent Matrix

> 目标：固定“谁规划、谁实现、谁测试、谁裁决”。用户不需要每次完整说明；命中 `P/G/E`、`Agent Matrix`、`worker`、`测试 worker` 或同类长周期任务时，默认按本矩阵执行。

| Agent | Model | Responsibility | Output | Stop Rules |
| --- | --- | --- | --- | --- |
| Planner | `gpt-5.5` | 拆需求、写 spec、写 task contract、定义验收标准 | `docs/workflow/spec.md`, `docs/workflow/tasks/*.md` | 需求不清、范围影响生产/数据库/安全时先确认 |
| Developer Worker | `deepseek-v4-pro` | 按已批准 contract 实现允许范围内的代码或文档 | `docs/workflow/worker-results/*-result.md` | contract 不清、越界路径、需要架构裁决时 `BLOCKED` |
| QA Worker | `deepseek-v4-pro` | Playwright UI smoke、布局/交互验证、截图和控制台日志采证 | `docs/workflow/qa-reports/*-qa.md` | 测试环境缺失、命令不可执行、模型不可用时 `BLOCKED` |
| Final Evaluator | `gpt-5.5` | 审 diff、审 worker report、审 QA evidence，最终判定 `PASS/FAIL/BLOCKED` | `docs/workflow/status.md`, final response | 证据不足时不得报 PASS |

## Canvas Defaults

- `/canvas` Sprint 默认不修改后端 API、权限、数据库、对象存储和 Sub2API 路由，除非 contract 单独批准。
- `/canvas` 图片预览允许使用缩略图；编辑、裁剪、生成和图生图提交必须走原图引用。
- Infinite-Canvas 只作为交互参考，不复制其源码或运行时。

## Defaults

- 大功能、多步骤、跨模块、需要 worker 或需要测试采证时，默认启用本矩阵。
- 一次性小修、简单解释、单条命令或纯 spike 不强制启用。
- 常规测试、验收、回归复核优先交给 `deepseek-v4-pro` worker；不要默认用 `gpt-5.5` 做测试 worker。
- `gpt-5.5` 只用于计划、最终裁决、疑难失败深审和高风险验收抽查。
- `deepseek-v4-pro` worker 不可用时报告 `BLOCKED` 或请求确认，不要静默回退到 `gpt-5.5`。

## Short Triggers

- `进入 P/G/E`
- `按 Agent Matrix`
- `开 worker`
- `调用开发 worker`
- `调用测试 worker`
- `跑测试 worker`
- `这个任务按矩阵走`

## Evidence Rules

- worker report 首行必须是 `### DONE: <task-id>`、`### BLOCKED: <task-id>` 或 `### FAILED: <task-id>`。
- QA report 首行必须是 `### PASS: <task-id>`、`### FAIL: <task-id>` 或 `### BLOCKED: <task-id>`。
- 主 Codex 只把真实命令、日志、截图、diff review 或人工检查当作完成证据。
