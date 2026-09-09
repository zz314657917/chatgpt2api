### DONE: task-036-gpt-image-2-5-profiles

## Changed Files
- 后端 util 模型目录、httpapi 请求校验与 JSON 网关、公共参考图链路、service 任务数量和压缩元数据。
- 前端共享参数/API/设置、图片页、Canvas、电商套图、Image Arena 和保存恢复。
- 修改均在 contract Allowed Paths 内；保留既有临时文件。

## Implementation
- 新增 Flare/Sunburst；15 种比例、精确像素、1K/2K/4K、六档质量、n<=4、16 张参考图。
- JPEG/WebP 压缩、背景与审核；默认审核 low；透明 JPEG 本地拒绝。
- 生成/编辑统一 JSON images/generations；白名单构造上游字段，不发送 response_format 或 mask。
- 2.5 保留 1k、原始比例和合法精确像素；旧 GPT Image 模型参数语义保持。
- 未增加 token 费用静态估算。

## Commands Run
- 定向 Go、全量 Go、前端 lint/typecheck/build。
- E:/task036-browser.mjs：图片页/Canvas 请求、套图保存恢复、Arena adapter 参考图请求 mock。
- E:/task036-asserts.mjs：前端断言与 HEAD 基线对照。

## Risks
- image-model-settings.assert.ts 中既有 Midjourney repeat=1 期望 undefined，当前实现归一为 2；HEAD 同样失败。本轮新增 2.5 断言在该失败之前执行通过。
- 无真实 APIMart 调用、付费额度或部署验证。

## Contract Compliance
- 未修改计费、鉴权、数据库、Docker、部署；未提交或推送。
- knowledge_candidates: none
