---
task_id: task-005-object-storage-primary
phase: accepted
owner: codex
qa_mode: browser
created_at: 2026-06-09
---

# Task 005: Object Storage Primary Image Store

## Goal
- Make configured image object storage the primary original-image store.
- Avoid keeping a second server-local original after successful object storage upload.
- Keep managed image URLs, image library metadata, permissions, thumbnails, previews, and deletion working through the server.

## Scope
- Allowed paths:
  - `internal/imagestore/object_store.go`
  - `internal/imagestore/object_store_test.go`
  - `internal/service/image.go`
  - `internal/service/image_test.go`
  - `internal/httpapi/app.go`
- Denied paths:
  - Production config and secrets.
  - Frontend UX changes.
  - Database/schema migrations.

## Acceptance Criteria
- Object storage supports authenticated `GetObject` reads.
- Uploaded/generated managed images delete the server-local original after successful object metadata is recorded.
- `/images/...`, image detail, image bytes, thumbnails, previews, and deletion still work when the original exists only in object storage.
- Existing local-only images remain discoverable for legacy/admin flows.
- Object storage upload failure still falls back to local original storage.

## Verification
- `go test ./internal/imagestore ./internal/service ./internal/httpapi`
- `go test ./...`
- `cd web && npm.cmd run lint`
- `cd web && npm.cmd run build`
- `git diff --check -- internal/imagestore/object_store.go internal/imagestore/object_store_test.go internal/service/image.go internal/service/image_test.go internal/httpapi/app.go`

## Result
- `PASS`
- Implemented object storage readback, local-original cleanup after object-backed persistence, server-side `/images/...` byte serving for object-backed originals, and focused tests for upload/read/delete behavior.
