### PASS: task-032-seedance-2-5-profile

# Task 032 Contract Review

## Verdict
`PASS`

## Findings
- Contract 以 APIMart Seedance 2.5 参数页为事实源，模型 ID、比例、分辨率、时长、音频、输出格式和参考图数量均有明确证据。
- 允许路径覆盖 Canvas profile、提交参数、后端 payload 和定向测试；明确排除视频编辑、延长、素材库、计费、鉴权和部署。
- 允许新增 `output/playwright/task-032-*` 作为隔离的浏览器 QA 脚本和截图，不允许修改既有 Task-031 工件。
- `web/src/app/canvas/types.ts` 仅允许增加视频输出格式持久化字段，不允许重构 Canvas schema。
- 2.5 使用独立 profile，不继承 2.0 的 `1080p` 与 `5..15` 秒边界；视频输出格式使用独立字段，避免污染图片节点契约。

## Risks Carried Forward
- 本 Sprint 不实现 `video_urls`、`audio_urls`、`image_with_roles`、纯音频参考、视频编辑或视频延长；这些需要对应的 Canvas 输入和任务交互设计。
- 未使用真实 APIMart Token 发起付费生成，最终只能证明 checkout 参数构造与本地 UI 行为。
