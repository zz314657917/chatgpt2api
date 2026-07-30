### PASS: task-024-image-task-error-localization

## Findings

- 未发现阻断问题。
- 截图中的 `HTTP 400 size: Value error, size must be auto or WIDTHxHEIGHT` 已映射为“当前模型不支持比例尺寸，请改为‘自动’尺寸，或使用‘宽度x高度’（如 1024x1024）后重试。”
- `/image`、Canvas、电商套图和任务队列均复用 `localizeErrorMessage`；未匹配错误仍保留其原始诊断文本。

## Executed Checks

- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"`：PASS，0 warnings / 0 errors。
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"`：PASS。
- Vite SSR 加载实际前端模块并调用目标翻译函数：PASS，结果包含“当前模型不支持比例尺寸”及 `1024x1024`。
- `go test ./...`：PASS。
- `git diff --check`：PASS，仅有既有 Windows LF/CRLF 提示。
- 本地 Vite `/image`：HTTP 200；应用内浏览器跳转到既有 `/login`，且没有 console error。

## Unverified Risks

- 没有可安全使用的已登录测试会话或真实失败任务，未在浏览器中对截图所示的结果卡片完成端到端截图复现。
- Playwright CLI 启动的本机 Chrome 被环境关闭；没有重试或更改浏览器配置。
- 本轮未更新 Docker 镜像或生产服务。

## Recommendation

- 源码可提交；部署包含本次 `internal/web/dist` 的前端后，可用已有失败任务或再次提交非法比例尺寸做一次人工确认。
