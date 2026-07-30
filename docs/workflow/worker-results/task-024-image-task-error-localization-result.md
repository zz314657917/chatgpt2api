### DONE: task-024-image-task-error-localization

## Changed Files

- `web/src/lib/request.ts`
- `web/src/app/image/page.tsx`
- `web/src/app/canvas/canvas-error-details.ts`
- `web/src/app/ecommerce-suite/page.tsx`
- `web/src/components/image-task-queue.tsx`
- Task-024 workflow artifacts.

## Result

- `localizeErrorMessage` 识别 `size must be auto or WIDTHxHEIGHT` 的大小写和空格变体，并提示用户当前模型不支持比例尺寸，应选择“自动”或使用 `1024x1024` 这类宽高格式。
- `/image` 的提交错误、结果卡片与轮询恢复的 creation task 错误在其既有专用提示之后回落到统一翻译入口。
- Canvas、电商套图和图片任务队列读取 creation task 错误时同样使用统一翻译入口；未知错误仍保留原文。
- 未改动图片请求参数、后端尺寸校验、任务状态、重试或计费语义。

## Verification

- `npm.cmd run lint`：PASS，0 warnings / 0 errors。
- `npm.cmd run build`：PASS，包含 TypeScript 检查和 Vite 生产构建。
- Vite SSR 模块加载实际调用 `localizeErrorMessage("HTTP 400 size: Value error, size must be auto or WIDTHxHEIGHT")`：PASS，输出目标中文提示。
- `go test ./...`：PASS。
- `git diff --check`：PASS，仅有既有 Windows LF/CRLF 提示。
