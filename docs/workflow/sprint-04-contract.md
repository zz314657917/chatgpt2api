---
task_id: canvas-sprint-004
phase: contract-approved
owner: generator
qa_mode: browser
last_updated: 2026-05-28
---

# Sprint 4 Contract

## Goal

收口图片多场景性能与当前画布未提交改动：图片列表只返回轻摘要，原图和完整元数据只按需读取；新增服务端中图预览；画布素材保存轻引用并修复循环节点 prompt 叠加风险。

## Success Criteria

- `/api/images` 使用索引分页，列表项不返回原图 URL、对象存储字段、prompt、参考图或完整生成参数。
- `/api/images/detail` 保持完整元数据和原图 URL，用于下载、复制、同款生成和高清查看。
- 新增 `/image-previews/...jpg`，按需生成最长边 1200px 的 JPEG 中图，权限与 `/image-thumbnails/...` 一致。
- 图片删除、存储治理和缓存清理覆盖原图、缩略图、中图、metadata、references 和对象存储。
- `/image-manager` 首屏只使用 summary 和缩略图，预览先用中图，下载/高清/同款生成才拉 detail。
- `/canvas` 图片素材保存 `path + thumbnail_url + preview_url`，运行图生图仍能通过 `path` 读取原图。
- `loop -> API生成` 连续运行不会把上游 prompt 写回 API 生成节点造成重复叠加。

## Allowed Paths

- `internal/config/**`
- `internal/httpapi/**`
- `internal/service/image.go`
- `internal/service/image_test.go`
- `web/src/lib/**`
- `web/src/components/**`
- `web/src/app/image-manager/**`
- `web/src/app/canvas/**`
- `web/src/app/settings/components/image-storage-governance-card.tsx`
- `web/src/app/settings/store.ts`
- `docs/workflow/**`
- `.gitignore`
- `knowledge/tasks/**`

## Denied Paths

- 生产 `.env`、账号、token、密钥文件。
- 非图片性能或当前画布稳定化相关模块。
- 数据库或外部存储迁移。

## Acceptance Commands

- `go test ./internal/service ./internal/httpapi`
- `cd web && npm.cmd run lint`
- `cd web && npm.cmd run build`
- `git diff --check`

## Browser Acceptance

- `/image-manager` 首屏不请求大量 `/images/...` 原图。
- 打开图片预览请求 `/image-previews/...`；下载或高清查看才请求 `/images/...`。
- 滚动分页追加正常，自动刷新不清掉后续页。
- `/canvas` 素材栏分页正常，拖图入画布保存轻引用，图生图提交仍可读取原图。

## Stop Rules

- 如果类型拆分导致大面积非图片页面改动，停止并回到 Planner 重新拆分。
- 如果中图缓存与对象存储策略冲突，保留本地文件缓存实现，不扩大到对象存储。
- 如果浏览器登录态阻塞自动化验收，用 API/Network 级证据记录未验证风险。
