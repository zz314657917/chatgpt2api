---
task_id: task-030-bead-maker-mode
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-08-06
---

# Task 030: Bead Maker Mode

## Task ID

task-030-bead-maker-mode

## Role

Generator。参考 `AngKernel/pindou-studio` 的制作交互独立实现平板友好的拼豆制作模式，并补齐参考图中的最少色块转换滑块。

## Goal

- 在现有拼豆工作台提供可进入/退出的制作模式：按豆板分区、当前板/全图切换、点击格子记录已完成、颜色高亮、隐藏已完成、进度统计、板间导航、缩放、防误触锁和屏幕常亮降级提示。
- 制作进度和当前豆板写入 v1 工程文档，自动保存并刷新恢复；不修改图层格子本身。
- 在图片导入面板增加“最少色块”滑块，控制连通色块最小尺寸并贯通转换算法、归一化、持久化和服务端校验。

## Success Criteria

- 制作模式在桌面和 1024px 左右平板横屏下形成侧栏 + 主画布布局，窄屏无横向溢出；点击非空格子可切换完成状态，已完成格子有稳定视觉区分。
- 当前豆板按 `board_width/board_height` 分区，上一板/下一板、全图缩略图点击定位和当前板进度均正确；只允许完成实际有颜色的格子。
- 防误触锁开启后不再改变进度；颜色高亮和隐藏已完成只影响展示；制作模式 UI 操作不产生图片转换或编辑历史。
- `completed_cells` 和 `active_board_index` 通过现有工程保存链路持久化，旧工程缺失字段回退为空进度，索引/副本/JSON 导入不会破坏兼容性。
- “最少色块”范围为 1 到 500，默认 1；数值增加会把小于阈值且存在邻色的连通块合并到边界邻色，阈值为 1 时算法结果保持原逻辑。
- 参数在前端 UI、`ConversionSettings`、adapter、Go 文档校验和 `imageFileToBeads` 入口保持一致。

## Context

- Repo: `F:/java/chatgpt2api`
- Read first: `docs/workflow/status.md`, `docs/workflow/spec.md`, `web/src/app/beads/upstream/workbench-app.tsx`, `web/src/app/beads/project-adapter.ts`, `internal/service/bead_project.go`
- External reference (behavior only): `https://github.com/AngKernel/pindou-studio` (`AGPL-3.0`, do not copy source)

## Allowed Paths

- `web/src/app/beads/**`
- `web/src/lib/api.ts`
- `internal/service/bead_project.go`
- `internal/service/bead_project_test.go`
- `docs/workflow/**`

## Denied Paths

- `knowledge/**`
- `C:/Users/Administrator/.codex/memories/**`
- `deploy/**`, Docker 配置、Sub2API、计费、鉴权、素材库 API、数据库迁移。

## Constraints

- 保持 `schema_version: 1`，新增字段可选并对旧文档提供确定性默认值；工程不得保存图片二进制、临时 URL 或撤销栈。
- 制作模式不复制 AGPL 源码；仅使用已有工作台主题变量和本地图案事实源。
- 进度索引只允许唯一、非负且小于 `width*height` 的非空格子；服务端拒绝越界、重复或错误类型。
- 保持当前 MARD 221/291、自动保存、revision 冲突和移动抽屉行为不回退。

## Acceptance Commands

```powershell
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"
cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run check:bundle"
go test ./internal/service ./internal/httpapi -count=1
go test ./...
git diff --check
```

## Browser QA Scenarios

- 进入工作台，确认“制作模式”入口存在；进入后在当前板点击一个有色格子，进度从 `0/N` 变为 `1/N`，再次点击可撤销完成。
- 切换下一板、全图视图、颜色高亮、隐藏已完成和防误触锁；确认全图点击可定位板，锁定后点击不改变进度。
- 修改最少色块滑块并上传同一张本地图片，确认转换结果或连通块数量随阈值变化；刷新工程后滑块和制作进度均恢复。
- 在 `1024x768`、`390x844` 检查无横向溢出、按钮文字完整、主画布可触控滚动/绘制。

## Output

- `docs/workflow/worker-results/task-030-bead-maker-mode-result.md`
- `docs/workflow/qa-reports/task-030-bead-maker-mode-qa.md`

## Stop Rules

- 如需新增路由以外的后端资源、素材/鉴权 API、Docker 或生产配置，停止并回 Planner。
- 如制作模式无法在现有工程保存/冲突链路中保持 revision 语义，停止并报告原因。
