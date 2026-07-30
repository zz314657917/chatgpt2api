---
task_id: task-024-image-task-error-localization
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-07-30
---

# Task 024: Image Task Error Localization

## Role

Generator

## Goal

将已知的图片尺寸校验错误转换为可执行的中文提示，避免图片、画布、电商套图和任务队列向用户直接展示 `size must be auto or WIDTHxHEIGHT` 等上游英文。

## Success Criteria

- 当错误包含 `size must be auto or WIDTHxHEIGHT`（大小写或 `x` 两侧空格不同均可）时，用户看到的提示明确说明：当前模型不支持比例尺寸，应改为“自动”或“宽度x高度”（如 `1024x1024`）。
- `/image` 的提交失败提示、结果卡片和恢复后的 creation task 错误均使用该中文提示。
- Canvas、电商套图和图片任务队列中的同类 creation task 错误使用同一翻译入口，不再各自原样显示该英文错误。
- 未匹配的错误继续保留原始信息；既有余额、配额、内容安全、超时、网络和限流提示不回退。

## Allowed Paths

- `web/src/lib/request.ts`
- `web/src/app/image/page.tsx`
- `web/src/app/canvas/canvas-error-details.ts`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/components/image-task-queue.tsx`
- `docs/workflow/**`

## Denied Paths

- 后端 API、上游请求构造、尺寸归一、任务状态、重试、计费、Sub2API、数据库和部署配置。
- 图片模型选项、Canvas schema、素材库数据结构和 `knowledge/**`。

## Constraints

- 仅处理显示文案；不得将非法比例自动改写为其他尺寸，也不得掩盖未识别的诊断信息。
- 复用现有 `localizeErrorMessage`，不新增依赖或平行翻译字典。
- 保留工作区现有的用户改动，不格式化无关文件。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
go test ./...
git diff --check
```

## Browser QA Scenarios

- 在图片生成结果卡片中复现或注入 `HTTP 400 size: Value error, size must be auto or WIDTHxHEIGHT`，确认没有英文校验文本，并给出“自动”与 `1024x1024` 的操作指引。
- 检查同类错误在 Canvas 和电商套图的任务结果/提示中走相同的中文映射。
- 确认余额不足、内容安全拒绝和未匹配错误仍按既有语义显示。

## Output

- `docs/workflow/task-024-contract-review.md`
- `docs/workflow/worker-results/task-024-image-task-error-localization-result.md`
- `docs/workflow/qa-reports/task-024-image-task-error-localization-qa.md`
- 更新 `docs/workflow/status.md`、`docs/workflow/spec.md` 与 `docs/workflow/main-log.md`。

## Stop Rules

- 如需修改尺寸请求参数、后端错误码、上游协议、任务重试或计费，停止并回 Planner。
- 如现有翻译入口无法覆盖四个界面且必须引入第二套错误字典，停止并重新评估共享边界。
