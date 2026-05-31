---
task_id: image-composer-asset-library
role: Generator
status: approved
qa_mode: browser
---

# Task Contract: Image Composer Asset Library

## Goal

在 `/image` 创作台右侧复用 `/canvas` 图片库能力，允许用户点击图库素材加入输入，并可将图库图片拖到创作台输入框作为参考图。

## Success Criteria

- `/image` 桌面视图右侧出现图片库入口，复用画布图片库的缩略图、展开、固定、刷新和分页行为。
- 图库素材点击“输入”后加入创作台参考图，并切换到图片创作模式。
- 图库素材拖到创作台输入框后加入参考图。
- `/canvas` 现有图片库入口和按钮行为保持不变。
- 不新增后端接口、不改权限模型、不改数据库。

## Allowed Paths

- `web/src/components/**`
- `web/src/lib/**`
- `web/src/app/image/**`
- `web/src/app/canvas/canvas-node.tsx`
- `docs/workflow/**`

## Denied Paths

- `internal/**`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- 配置、数据库、部署和权限默认值

## Constraints

- 复用现有 `/api/images`、`ManagedImageSummary`、缩略图和认证图片加载逻辑。
- 拖拽协议必须兼容画布当前 `application/x-chatgpt2api-managed-image` 读取方式。
- 不覆盖当前工作区已有用户改动。

## Acceptance Commands

- `cd web && npm.cmd run lint`
- `cd web && npm.cmd run build`
- `git diff --check`

## Output

- 实现摘要
- 执行过的验证命令
- 未验证风险

## Stop Rules

- 需要改后端、权限、数据库或生产配置时停止并确认。
- 发现当前画布未提交改动与本任务冲突时停止并确认。
