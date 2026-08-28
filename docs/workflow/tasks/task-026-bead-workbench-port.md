---
task_id: task-026-bead-workbench-port
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-08-05
---

# Task 026: Bead Workbench Port

## Task ID

task-026-bead-workbench-port

## Role

Generator。按固定上游 commit 原生迁入拼豆工作台，不做素材库、自动保存冲突或移动端抽屉的架构扩展。

## Goal

把 `Jett-Wu/Perler_Beads_Generator@36ac52d570246ab600611a79edd2236bccb954e5` 的核心算法、MARD 色卡、工程编辑器、Canvas、3D、统计和全部导出能力迁入当前 React/Vite 项目，并提供 `/beads` 项目列表与 `/beads/:projectId` 完整中文工作台。复用 Task-025 云端 API 完成列表 CRUD 和打开工程，自动保存/素材互通/冲突弹窗留给 Task-027。

## Success Criteria

- 一级导航新增“拼豆工坊”，位于“电商套图”与“素材库”之间；`/beads` 与 `/beads/:projectId` 均受 `/beads` 权限保护并属于 viewport workspace。
- `/beads` 显示 Task-025 的真实工程摘要，支持新建、打开、重命名、复制、删除、更新时间、尺寸、豆数和真实格子预览。
- `/beads/:projectId` 加载完整 v1 工程并提供图片转换、MARD 221/291、画笔/橡皮/填充/移除/重着色/取色/移动/复制粘贴/镜像/形状/文字/平移、撤销重做、多图层、参考图控制、统计、3D 和 PNG/PDF/Excel/JSON 导出。
- UI 只有中文；使用本项目主题变量、Lucide 图标、Button/Dialog/Input/Select 等 primitives；不保留上游英文语言切换、独立顶栏或 iframe。
- 上游算法/色卡/Canvas/导出器保留清晰来源边界；所有全局 `React` 用法改为标准模块导入。
- 所有拼豆 CSS 限定在 `.beads-workbench` 或 `.beads-projects-page` 下，不污染现有页面；桌面保持中央画布加侧面板。
- `ThreePreview` 与导出器按动态 import 加载；Three.js 使用 named imports，并在 Vite 中生成独立 `vendor-three` chunk。
- 根级 `THIRD_PARTY_NOTICES.md` 包含上游仓库、固定提交和完整 MIT copyright/license；不迁入上游脚本、构建产物、README 或截图。
- `npm run check:bundle` 的总预算改为 5 MiB；单资产仍 512 KiB，拼豆主页面 chunk 不超过 220 KiB。

## Context

- Repo: `F:/java/chatgpt2api`
- Upstream read-only checkout: `E:/codex-upstreams/Perler_Beads_Generator`
- Fixed commit: `36ac52d570246ab600611a79edd2236bccb954e5`
- Read first: `docs/workflow/spec.md`, `docs/workflow/status.md`, `web/src/app/route-config.tsx`, `web/src/components/top-nav.tsx`, `web/src/lib/api.ts`

## Allowed Paths

- `web/src/app/beads/**`
- `web/src/app/route-config.tsx`
- `web/src/app/animated-routes.tsx`
- `web/src/components/top-nav.tsx`
- `web/src/lib/api.ts`
- `web/src/lib/request.ts`
- `web/package.json`
- `web/package-lock.json`
- `web/vite.config.ts`
- `web/scripts/check-bundle-size.mjs`
- `THIRD_PARTY_NOTICES.md`
- `docs/workflow/**`

## Denied Paths

- `internal/**`、Task-025 API/schema/RBAC、数据库、对象存储、图片上传 API、Sub2API、计费、AI 生成、Docker 与部署配置。
- `web/src/app/image-manager/**`、共享素材库侧栏和 Task-027 的素材上传/自动保存冲突/移动抽屉逻辑。
- `knowledge/**` 与上游 `scripts/`、`docs/`、README、构建产物。

## Constraints

- 不使用 iframe、独立 HTML、CDN script 或上游构建流程；代码必须进入当前 Vite module graph。
- 仅新增 `three` 运行依赖；不得引入外部 PDF/Excel 库，上游导出器已有纯 TS 实现。
- 保持上游 MIT 文件头/第三方声明可追溯；本地化和模块化修改不得移除版权信息。
- `ThreePreview` 不允许 `import * as THREE`；改为 named imports。
- 项目列表 CRUD 立即调用 Task-025 API；工作台本 Sprint 的显式保存可调用 `saveBeadProject`，1200ms 自动保存和 409 UI 留 Task-027。
- 保留现有脏工作树，不格式化或回滚无关文件。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run check:bundle"
go test ./internal/service ./internal/httpapi -count=1
git diff --check
```

## Browser QA Scenarios

- `/beads` 新建工程并打开 `/beads/:id`；列表真实预览、重命名、复制、删除正常。
- 上传本地测试图片并转换，切换 MARD 221/291，验证编辑工具、多图层、撤销重做和用量统计。
- 3D canvas 有非空像素，打开/关闭与旋转缩放不报错。
- PNG/PDF/XLSX/JSON 四种导出均触发下载且文件非空。
- 1440x900 桌面工作台无页面横向溢出，深浅色下主工具和文字可读。

## Output

- `docs/workflow/worker-results/task-026-bead-workbench-port-result.md`
- 第一行必须为 DONE/BLOCKED/FAILED verdict，并列 changed files、commands、risks、contract compliance。

## Stop Rules

- 固定 commit 不可读取、许可证不符或必须复制未授权资产时停止。
- 如需改后端 schema/API、素材上传 API、计费或部署，停止并回 Planner。
- 如核心页面 chunk 超 220 KiB 且无法通过合理动态 import/module split 达标，报告 BLOCKED，不提高预算规避。

## Budget

- worker_model: `deepseek-v4-pro`（已知当前 Claude CLI 404，主控 Codex执行）
- max_budget_usd: `0.10`
- worktree_root: `E:/codex-worktrees`
