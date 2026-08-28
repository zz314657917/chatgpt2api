### PASS: task-027-bead-assets-mobile-integration

# Task-027 Contract Review

## Verdict

`PASS`

## Contract Checked

- `docs/workflow/tasks/task-027-bead-assets-mobile-integration.md`
- Product scope in `docs/workflow/spec.md` and the completed Task-025/Task-026 contracts.

## Findings

- 自动保存的 1200 ms 起点、四种用户可见状态、串行队列和“保存期间的新编辑不得被旧响应覆盖”均已明确，避免把手动保存回调简单改成定时 `PUT` 后发生 revision 串乱。
- 409 被限定为完整的三选项冲突流程：重新加载、另存副本、取消。契约禁止自动覆盖、伪造 revision 和取消后的隐式重试，且要求从完整工程 GET 恢复，而不是只依赖 409 中的 revision 数字。
- 素材路径严格复用既有 `/api/images` typed client。个人/团队范围映射、`team_id` 条件、授权读取和工程引用白名单均有可验证条件；临时签名 URL、浏览器 URL、`data:`、`blob:` 和二进制无法进入工程/JSON。
- PNG 回存要求下载与上传消费同一组渲染 Blob，涵盖多图层输出，避免同一导出选项走两条像素不一致的渲染路径。
- 移动端约束要求同一份工程状态和完整工具面，明确 390px 触控、抽屉关闭后的画布可用区域、文字/溢出以及 1440/1280 回归。不会把隐藏桌面面板误判为移动端适配。
- Allowed Paths 限在拼豆前端和既有 typed client；后端 `/api/images`、对象存储、Task-025 资料、计费、AI 与部署都在 Denied Paths，符合本 Sprint 只做集成的边界。

## Acceptance Coverage

- `npm.cmd run lint`、`npm.cmd run build`、`npm.cmd run check:bundle`、Task-025 定向 Go 回归和 `git diff --check` 是可执行的基础门禁。
- Browser QA 明确覆盖自动保存并发编辑、双标签 409、个人/团队素材、本地上传、PNG 下载/回存一致性，以及 `1440x900`、`1280x720`、`390x844` 三视口。Task-028 仍负责更广的最终端到端和全包回归裁决。

## Risks Carried Forward

- 当前 Vite 独立 mock 环境未覆盖全部既有公共接口，素材库和团队权限需要在有登录态的浏览器会话中采证。
- 既有全包 service/httpapi 测试存在无关的 Sub2API 计费失败；本 Sprint 不修改该链路，contract 仅要求可证明的拼豆定向回归。Task-028 应报告全量测试实际结果，不得把该已知基线说成拼豆修复。
- 目标浏览器对主题 `oklch` 变量的支持差异仍需深色实际会话复核；本任务把深色抽屉/工作台对比度纳入 browser QA，但不声称生产浏览器已覆盖。
