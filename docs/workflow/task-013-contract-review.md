### PASS: task-013-prompt-split-canvas

# Contract Review

- `task-013` 使用唯一任务 ID，未与现有 `task-012-text-asset-collections` 冲突。
- Allowed paths 覆盖新持久化服务、HTTP 路由、Canvas 类型/控制器/UI 与必要测试；用户正在修改的 `canvas/page.tsx` 和素材侧栏明确排除。
- Contract 将 direct batch 限制在纯文生图，要求复用 creation-task 的内容策略、限流和结算，避免绕过 billing 边界。
- 失败、幂等、取消、重启恢复、mini UI 与浏览器验收均有明确标准。
- 用户已通过 `PLEASE IMPLEMENT THIS PLAN` 授权本 Sprint，`approval_required` 已满足。

# Decision

Approved for implementation.
