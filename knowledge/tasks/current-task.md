# Current Task

最后更新：2026-08-28 08:10 +08:00

## 背景

- 当前 Sprint 为 `task-035-seedream-image-profiles`，contract review 已 PASS；范围受 `docs/workflow/tasks/task-035-seedream-image-profiles.md` 与 Amendment 1 约束。
- 官方来源为 APIMart Seedream 4.0、4.5、5.0 Lite、5.0 Pro 文档；4.x 下游 bridge ID 保持 `doubao-seedance-4-0/4-5`。

## 当前目标

- 已完成四个 Seedream profile 的模型目录、后端 payload 校验、任务数量上限、图片页/Canvas/电商套图/Image Arena 参数传播和隔离浏览器验收。

## 本次已完成

- 4.0：1K/2K/4K、n=1..15；4.5：2K/4K、n=1..15；4.x 输入图+输出图合计最多 15。
- Lite：2K/3K/4K、PNG/JPEG、组图、n=1..15，输入图+输出图最多 15；Pro：1K/1.5K/2K、PNG/JPEG、固定 n=1、最多 10 张参考图，无组图。
- 后端拒绝非法尺寸、分辨率、格式、数量、参考图和 sequential options；多图最终强制 sequential `auto`，单图默认 `disabled`。
- 前端任务字段构造器接收最终数量，图片页和 Canvas Lite n=15 均为单个任务请求，且不带 quality、Gemini 搜索或 Grok 字段。

## 已确认事实

- 定向、相关包、全量 Go 均通过；前端 lint 0 error、build 通过。
- 图片页分辨率菜单：4.0=`1K/2K/4K`，4.5=`2K/4K`，Lite=`2K/3K/4K`，Pro=`1K/1.5K/2K`。
- Canvas Lite 请求为 `model=seedream-5-0-lite`、`n=15`、`sequential_image_generation=auto`、`max_images=8`、`output_format=jpeg`。

## 待验证点

- 真实 APIMart 生成、审核、返回图片、供应商报价/计费：验证方式 -> 另行申请独立 Token/额度执行受控 smoke；当前未授权。
- 运行实例是否生效：验证方式 -> 另行授权后构建 embedded binary/部署并检查 `/health` 与版本；本轮未执行。

## 当前结论

- Task-035 在源码、自动化测试和隔离浏览器 mock 范围内 `PASS`。不得宣称真实 APIMart 付费生成、供应商计费或生产部署已验证。

## 下一步

- 若继续：先读 `docs/workflow/status.md` 与本文件，由 Planner 为新独立 scope 建立 contract。
- 若验证真实上游：动作 -> 使用独立 Token/额度；验证 -> 记录请求、任务终态、图片结果和费用证据。
- 若让运行态生效：动作 -> 另行授权构建/部署或 Docker 更新；验证 -> `/health`、版本标识和图片任务 smoke。

## 验证记录

- `go test ./internal/httpapi -run "Test.*(Seedream|CanvasImageModel)" -count=1`：PASS。
- `go test ./internal/service ./internal/util -run "Test.*(Seedream|ImageTaskCount|ImageGenerationModel)" -count=1`：PASS。
- `go test ./internal/httpapi ./internal/service ./internal/util -count=1`：PASS。
- `go test ./...`：PASS。
- `cd web; npm.cmd run lint`：PASS，0 error；2 条拼豆既有 hooks warning。
- `cd web; npm.cmd run build`：PASS。
- Task-035 Allowed Paths `git diff --check`：PASS，仅 LF/CRLF 提示。
- `E:/task035-seedream-browser.mjs`：PASS。
- `E:/task035-seedream-canvas-browser.mjs`：PASS。
