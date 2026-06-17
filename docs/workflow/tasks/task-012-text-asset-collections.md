---
task_id: task-012-text-asset-collections
phase: contract-approved
owner: codex
qa_mode: browser
created_at: 2026-06-17
---

# Task 012: Text Asset Collections

## Goal

给文本素材补齐与图片素材类似的素材集分类能力，覆盖个人和团队文本素材。

## Success Criteria

- 文本素材返回 `collection_id` / `collection_name`。
- `GET /api/text-assets` 支持 `collection_id` 过滤，含未归类筛选。
- 新增 `/api/text-asset-collections` 与 `/api/text-asset-collections/items`，支持列表、创建、重命名、删除、文本素材归类/移出。
- 个人和团队文本素材集按 owner/team 隔离；团队写操作仍要求 owner 或 manager。
- 前端素材库的“文本”模式可查看、创建、重命名、删除素材集，并对单条文本素材加入/移出素材集。
- 不恢复公开素材库入口或公开分类功能。

## Allowed Paths

- `internal/service/text_asset.go`
- `internal/service/text_asset_test.go`
- `internal/httpapi/app.go`
- `internal/httpapi/router.go`
- `internal/httpapi/app_test.go`
- `internal/service/permissions.go`
- `internal/service/auth.go`
- `internal/service/permissions_test.go`
- `web/src/lib/api.ts`
- `web/src/app/image-manager/page.tsx`
- `docs/workflow/*`

## Denied Paths

- 数据库迁移和生产配置。
- 公开素材库 UI / public 素材库恢复。
- 图片素材集语义改造。

## Acceptance Commands

- `gofmt` on changed Go files.
- `go test ./internal/service ./internal/httpapi -count=1`
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run lint"`
- `cmd.exe /d /s /c "cd /d F:\java\chatgpt2api\web && npm.cmd run build"`
