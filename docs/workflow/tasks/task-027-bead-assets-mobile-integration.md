---
task_id: task-027-bead-assets-mobile-integration
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-08-05
---

# Task 027: Bead Assets and Mobile Integration

## Task ID

task-027-bead-assets-mobile-integration

## Role

Generator。只执行本 contract，将 Task-026 工作台接入既有素材库并完成可靠保存与移动端交互；不改变 Task-025 的后端工程契约或现有素材库 API。

## Goal

为 `/beads/:projectId` 提供 1200 ms 防抖自动保存、明确保存状态和 revision 409 冲突处置；复用现有 `/api/images` 完成私有原图/参考图上传、个人/团队素材选择及 PNG 回存。桌面工作台保持现有中央画布与面板，移动端使用底部工具栏及按需抽屉或等价面板，保留全部工作台能力。

## Success Criteria

- 工程加载完成即为“已保存”；任意可持久化编辑后立即显示“未保存”，距最后一次编辑 1200 ms 后进入“保存中”，成功后显示“已保存”，失败后显示“保存失败”。状态必须在工作台顶层可见，不能只依赖 toast。
- 自动保存与现有显式保存共用单一串行保存队列。保存期间的后续编辑保留在当前草稿中，旧请求成功不得覆盖新编辑；其 1200 ms 等待已到期时，在前一个请求成功后继续保存最新草稿。不得并发提交两个相同工程的 `PUT`。
- 每次 `PUT` 使用当前云端 document 的 revision；成功响应成为下一次保存的基线。网络/校验失败不丢失本地草稿，失败后自动保存暂停至新的编辑或显式保存，不伪报“已保存”。
- 收到 `HTTPError.status === 409` 时，停止自动重试并显示冲突弹窗，且只有以下动作：
  - “重新加载云端”：重新 `GET /api/bead-projects/{id}`，丢弃本地未保存草稿，以云端完整工程和最新 revision 恢复工作台。
  - “将本地内容另存副本”：使用当前本地草稿创建新工程，成功后跳转到新 ID，原工程绝不被覆盖，新工程 revision 从服务端的 1 开始。
  - “取消”：保留本地草稿并保持未保存/冲突状态，暂停自动保存；下一次显式保存可再次打开同一冲突处置，不得静默用旧 revision 重试。
- 保存、加载、冲突解决和路由卸载均用请求/编辑代号防止过期异步结果回写新项目或新草稿。无浏览器可保证的退出保存不可以显示为已完成。
- 本地选作转换原图或临摹参考图的文件，先用既有 `uploadManagedImages([file], "private")` 上传到个人素材库；仅在上传成功后把返回项映射为工程 `source_image` 或 `reference_image`。上传失败时可继续本地预览/转换，但要明确显示该原图未同步、无法跨设备恢复，且不得写入临时 URL。
- 工作台提供个人与有权限的团队素材选择。使用既有 `fetchManagedImages` / `fetchManagedImageDetail` 按 `scope="mine"|"team"`、团队时附 `team_id` 获取图片；团队素材入口只在当前会话具有对应素材访问权限和有效团队时显示。选择后的工程引用严格为 `{ path, name, scope: "mine" | "team", team_id? }`：个人引用没有 `team_id`，团队引用必须带当前团队 ID。
- 用于显示或读取像素的 `preview_url`、详情 `url`、download URL、`data:`、`blob:`、本地 `File` 和图片二进制只能留在运行时，永不写进 `BeadProjectDocument`、导出 JSON 或 localStorage。对个人/团队素材均通过现有鉴权接口获取运行时原图。
- PNG 导出面板提供“保存到个人素材库”。下载与回存必须消费同一套 PNG 渲染产物（每个导出图层的文件名、像素和 Blob 相同）；回存使用现有个人私有上传 API，`File.type` 为 `image/png`。成功时报告实际保存数量；上传失败不能影响已经完成的本地下载，也不能把导出的 PNG 自动改作工程原图/参考图。
- 桌面端继续显示中央画布与工具/图层/色板/统计面板。移动端在 `390x844` 下将工具、图层、色板和统计放进有图标和中文可访问名称的底部工具栏及按需抽屉/面板；所有编辑工具、图层操作、色板选择、统计、保存、素材选择、导出、缩放与触控绘制均可使用，不得只用 CSS 隐藏能力。
- 移动端关闭抽屉时画布占用可用工作区，底栏预留安全区且不覆盖画布触控区域；打开面板时有清晰关闭/返回操作，不出现永久悬浮的侧栏、横向溢出、被裁切的文字或互相重叠的控件。桌面现有 `1440x900`、`1280x720` 布局不能回退。
- UI 不允许产生后端不可保存的工程：画布边长维持 1..156、图层上限 20、格子数与尺寸同步；名称和素材引用继续符合 Task-025 v1 校验。不得新增客户端绕过校验、兼容层或新的 schema。

## Context

- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`, `docs/workflow/tasks/task-025-bead-project-cloud-storage.md`, `docs/workflow/tasks/task-026-bead-workbench-port.md`
- Related frontend boundaries:
  - `web/src/app/beads/page.tsx` currently owns project load/save and manual save state.
  - `web/src/app/beads/project-adapter.ts` maps cloud document and workbench state.
  - `web/src/app/beads/upstream/workbench-app.tsx` owns image/reference input, export panel and desktop workbench state.
  - `web/src/lib/api.ts` already exposes `fetchManagedImages`, `fetchManagedImageDetail`, `uploadManagedImages`, `saveBeadProject`, `createBeadProject` and `BeadAssetReference`.
  - `web/src/lib/request.ts` already exposes typed `HTTPError.status` and `HTTPError.data`.
- Do not copy image-manager page logic. Reuse its typed API methods and the current session/team permission model.

## Allowed Paths

- `web/src/app/beads/**`
- `web/src/lib/api.ts` only for a missing typed frontend helper or type required to call an existing `/api/images` endpoint; do not change endpoint semantics.
- `web/src/lib/request.ts` only if Task-025's typed `HTTPError` is insufficient to read a structured 409 response.
- `docs/workflow/**`
- `output/playwright/task-027-*` for QA-only screenshots, downloads and browser evidence.

## Denied Paths

- `internal/**`, `/api/images` handlers, Task-025 service/schema/RBAC/storage, database migrations and object-storage protocol.
- `web/src/app/image-manager/**`, shared asset-library behavior, other workspaces, navigation, dependency manifests, Vite chunk policy and third-party notices.
- Sub2API, AI generation, billing, Docker, deployment, production configuration, `knowledge/**` and `C:/Users/Administrator/.codex/memories/**`.

## Constraints

- Use only existing `/api/images`, `/api/images/detail`, `/api/images/uploads` and Task-025 `/api/bead-projects` public interfaces. Do not create an upload endpoint, proxy object bytes through the beads API, or loosen asset authorization.
- Keep HTTP and asset side effects at the beads integration boundary. Upstream palette, conversion, canvas and rendering modules must remain pure of session/API policy except for a narrow injected callback or typed prop when necessary.
- Keep project references compatible with the Task-025 service whitelist. Map material-library `library_scope="personal"` to project `scope="mine"`; never persist `scope="all"`, public scope, URL or server-only metadata.
- Do not persist undo/redo history. Do not add a local-draft fallback that masks cloud save failure or revision conflict.
- Reuse current theme variables, Lucide icons and existing UI primitives. All newly visible strings are Simplified Chinese. CSS remains namespaced below `.beads-workbench` or `.beads-projects-page`; no global mobile reset.
- Do not add runtime dependencies. Preserve Task-026 dynamic Three.js/export loading and bundle budgets.
- Preserve existing user changes; do not format or refactor unrelated files. Do not commit, push, deploy or update Docker.

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run check:bundle"
go test ./internal/service ./internal/httpapi -run 'Test(BeadProject|AppRouterMatchesBeadProjectSubtree)' -count=1
git diff --check
```

## Browser QA Scenarios

- 在两个独立浏览器标签打开同一工程。标签 A 修改并等待自动保存；标签 B 修改并保存后，再让标签 A 保存，确认出现 409 弹窗；逐项验证重新加载、另存副本、取消都不覆盖云端工程。
- 对一次绘制、连续绘制和保存期间继续绘制验证 1200 ms 防抖与串行保存：刷新后只恢复最终格子内容和最新 revision；保存失败时草稿仍在且状态不误报。
- 上传本地原图和本地参考图，确认图片出现在个人私有素材库、工程只包含白名单引用；刷新后可通过鉴权素材读取恢复。分别从个人和团队素材选图，确认 team ID 不串用，权限不足时入口隐藏。
- 从 PNG 导出面板同时下载并保存到个人素材库；比较下载文件和上传前 Blob 的 PNG 头/尺寸，确认相同渲染结果；模拟上传失败时下载继续成功。
- 在 `1440x900`、`1280x720`、`390x844` 验收无横向溢出、文本/按钮不裁切、画布可见、底栏和抽屉可开关。390px 覆盖触控绘制/缩放、工具、图层、色板、统计、保存、素材选择和 PNG 导出；深浅色各至少检查一处工作台和一处抽屉对比度。

## Output

- `docs/workflow/worker-results/task-027-bead-assets-mobile-integration-result.md`
- 第一行必须是 `### DONE: task-027-bead-assets-mobile-integration`、`### BLOCKED: task-027-bead-assets-mobile-integration` 或 `### FAILED: task-027-bead-assets-mobile-integration`。
- 报告必须列出 changed files、自动保存/冲突状态机、素材引用映射、PNG Blob 复用、commands run、浏览器证据、risks、contract compliance 和 knowledge_candidates；不粘贴无关长日志。

## Stop Rules

- 如果实现需要修改 `/api/images`、对象存储、鉴权/RBAC、Task-025 API/schema 或数据库迁移，停止并回 Planner；不得以新的临时 URL、base64 或兼容字段规避。
- 如果团队素材授权无法由当前 session/API 安全判定，隐藏团队入口并报告 BLOCKED/裁决需要，不得按“all”范围枚举或猜测 team ID。
- 如果 409 响应不包含可判别的 status 或无法用现有完整工程 GET 实现三种冲突动作，停止并回 Planner；不得自动覆盖云端、提高 revision 或无提示重试。
- 如果抽屉/底栏方案需要重复一份工作台状态、导致功能缺失或触控画布不可用，停止并重设计；不得以桌面-only 功能标记为完成。
- 如果动态导入、构建或 bundle budget 回退，停止并修复分包；不得提高预算规避。
- 如果验收命令或浏览器场景无法执行，报告明确环境原因和已完成的最小证据，不得声称 PASS。

## Budget

- worker_model: `deepseek-v4-pro`（已知 Claude CLI 404 时由主控 Codex 实现，不静默替换）
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
