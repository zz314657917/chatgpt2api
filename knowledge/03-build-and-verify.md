---
title: Build And Verify
type: build
repo: chatgpt2api
last_verified: 2026-05-21
---

# 构建与验证

## 常用命令

前端构建：

```bash
cd web && npm run build
```

前端 lint：

```bash
cd web && npm run lint
```

后端测试：

```bash
go test ./...
```

带 embed 的本地二进制构建：

```bash
go build -tags=embed -ldflags "-X chatgpt2api/internal/version.Version=1.0.0" -o chatgpt2api ./internal
```

本地运行：

```bash
CHATGPT2API_ADMIN_PASSWORD=change_me_please ./chatgpt2api
```

## 当前推荐验证组合

图片工作台前端、拖拽回编辑器、继续编辑、draft 保留类修改：

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. 如涉及后端协议或任务状态，再补 `go test ./...`
4. `git diff --check`

Sub2API launch/redeem、登录态桥接、图片任务路由或对象存储类修改：

1. `go test ./...`
2. `cd web && npm run build`
3. `git diff --check`
4. 如本地预览环境可用，再补 `http://127.0.0.1:8081/image` 或对应页面的最小人工回读

配置限制、保留上限、策略开关类修改：

1. 先补对应 Go 测试
2. `go test ./...`
3. `cd web && npm run build`
4. `git diff --check`

## 当前稳定验证心智

- 当前 image workspace 主线至少应覆盖：
  - 创建聊天时保留 draft
  - 结果可继续编辑
  - 本地结果 URL 可用于 continued edits
  - per-user image retention cap 生效
  - image workspace policies hardening 不破坏已有主流程
- 只跑前端 build 不足以证明 Sub2API launch/redeem 或图片任务链路正确；涉及登录态、任务、配置和存储时必须带后端测试。
- 只跑 `go test ./...` 也不足以证明 `/image` 工作台 UI 没被破坏；涉及编辑器、拖拽和展示流时应至少补前端 build。

## 当前验证缺口

- 仓库目前缺少一份更细的“Sub2API image workspace 最小人工闭环”记录，尤其是 launch -> `/image` -> continued edit 的真实页面验证入口。
- 当前知识库已能指向命令，但对“哪些改动必须同时验证前后端”之前表达不够稳定，后续应继续按场景细化。
