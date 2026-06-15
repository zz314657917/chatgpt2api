---
task: task-008-pro-studio-v1
status: approved
reviewer: codex
last_verified: 2026-06-16
---

# Task 008 Contract Review

## 审查结论
- PASS：`docs/workflow/tasks/task-008-pro-studio-v1.md` 已覆盖 Pro Studio v1 的目标、成功标准、允许路径、拒绝路径、约束、验收命令、浏览器 QA、输出格式和 stop rules。

## 完整性
- Contract 覆盖前端共享能力层、共享组件、Canvas 接入、Ecommerce 接入、后端强校验、任务 metadata、图片资产 metadata 和普通模式回归要求。
- Contract 已补充 `internal/httpapi/routes.go`，因为 creation-task 提交、`imageTaskRequestMetadata` 和 `imageOutputOptionsFromBody` 是后端强校验与 metadata 透传的真实入口。
- Contract 明确禁止数据库 schema、支付/登录/扣费协议、生产配置、第三方依赖和系统性重写，范围可以交给 Generator 执行。

## 可实现性
- 可实现；当前仓库已有 `web/src/lib/image-task-request.ts`、`web/src/lib/api.ts`、Canvas 节点运行链路、Ecommerce 参考图/任务提交链路、`internal/httpapi/sub2api.go` official gateway 能力、`internal/service/image_task.go` 任务记录和 `internal/service/image.go` 图片资产 metadata 基础。
- 需要注意：`internal/service/image_parameters.go` 当前通用 compression helper 仅默认 JPEG；Pro Studio 要在 official 语义下支持 WebP compression，避免污染普通模式。

## 可测试性
- 可测试；自动验收命令为 `npm.cmd run lint`、`npm.cmd run build` 和 `go test ./...`。
- 浏览器 QA 需覆盖 `/canvas` 普通模式、`/canvas` 生产模式 1:1/16:9 4K high、图生图/多参考图/mask、`/ecommerce-suite` 普通模式、生产模式素材预设、SKU 8/12 张拆分，以及历史记录/素材库/Canvas 节点 metadata 展示。

## 风险与约束
- 不允许把 `n>4` 静默截断；前端批量必须拆 task，后端单请求必须明确拒绝。
- 不允许把 Pro Studio 校验应用到普通模式。
- 不允许新增 schema 或依赖；如果 metadata 现有结构无法承载，必须停止并回 Codex 裁决。

## 下一步
- 将 `docs/workflow/status.md` 推进到 `contract-approved`。
- 下一合法动作：Generator 实现，或按 Agent Matrix 调用 `deepseek-v4-pro` Developer Worker 执行已批准 contract。
