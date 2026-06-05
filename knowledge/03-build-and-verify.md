---
title: Build And Verify
type: build
repo: chatgpt2api
last_verified: 2026-06-04
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
4. 如本地预览环境可用，再补 `http://127.0.0.1:8081/image`、`/canvas` 或对应嵌入入口的最小人工回读

配置限制、保留上限、策略开关类修改：

1. 先补对应 Go 测试
2. `go test ./...`
3. `cd web && npm run build`
4. `git diff --check`

`/canvas` 节点画布、保存/轮询、节点交互、视频节点或创作流类修改：

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `go test ./...`
4. `git diff --check`
5. 如本地预览环境可用，按 `knowledge/07-canvas-manual-checklist.md` 至少补 `/canvas` 的最小人工或浏览器回读

`/image` 分辨率预设、图片参数共享配置、Sub2API 图片 payload 规范类修改：

1. `go test ./...`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. `git diff --check`
5. 如本地预览环境可用，至少补 `/image` 的最小页面回读，并确认分辨率/格式/压缩参数未回退

## 当前稳定验证心智

- 当前 image workspace 主线至少应覆盖：
  - 创建聊天时保留 draft
  - 结果可继续编辑
  - 本地结果 URL 可用于 continued edits
  - per-user image retention cap 生效
  - image workspace policies hardening 不破坏已有主流程
  - 从 Sub2API launch 进入后，已绑定 API key 不会在 session 初始化或刷新后丢失
  - embedded mode 下 stale token / store 失效后，仍能通过 cookie 恢复认证态
- 当前 `/canvas` 主线至少应覆盖：
  - 页面能正常打开并保留全局顶部导航
  - 默认节点或空白画布加载符合预期
  - Prompt / image / image_generation / result 节点能正常交互
  - 视频生成节点能按当前绑定状态正确显示或隐藏
  - 生成节点提交后 queued/running 状态、轮询恢复和 Output 回填不退化
  - 自动保存不会用旧请求覆盖新编辑
- 当前 `/image` / 参数共享主线至少应覆盖：
  - composer 分辨率预设能正常展示与切换
  - `auto` 不会误作为 `image_resolution` 提交
  - 像素图标尺寸不会叠加分辨率预设
  - `1080p -> 1k`、`output_format`、`output_compression` 的前后端归一规则不退化
- 只跑前端 build 不足以证明 Sub2API launch/redeem 或图片任务链路正确；涉及登录态、任务、配置和存储时必须带后端测试。
- 只跑 `go test ./...` 也不足以证明 `/image` 工作台 UI 没被破坏；涉及编辑器、拖拽和展示流时应至少补前端 build。
- 只跑命令行构建也不足以证明 `/canvas` 交互没退化；涉及节点拖拽、连线、画布缩放、自动保存和运行状态时，应至少补浏览器侧最小回读。
- 只验证“能打开登录页”不足以证明嵌入链路正常；涉及 embedded session、Sub2API key 绑定或 launch/redeem 时，至少要确认用户不是被错误打回匿名态，且绑定 key 仍保持。
- 只验证“视频节点能看到”也不足以证明能力边界正确；还要确认无 Sub2API 绑定时它会 fail-closed 隐藏，而不是留给运行时报错。

## 当前验证缺口

- 仓库目前缺少一份更细的“Sub2API image workspace 最小人工闭环”记录，尤其是 launch -> `/image` -> continued edit 的真实页面验证入口。
- `/canvas` 最小人工闭环已整理到 `knowledge/07-canvas-manual-checklist.md`，覆盖建画布、拖入图片、节点运行、Output 回填、自动保存和重新打开恢复。
- 当前知识库已能指向命令，但对“哪些改动必须同时验证前后端”之前表达不够稳定，后续应继续按 `/image`、`/canvas`、登录态桥接、对象存储、策略开关这些场景细化。
- 对 embedded session recovery / bound key preservation 这类修复，知识库目前还缺一份更细的最小人工检查清单，例如“从 launch 进入后刷新页面、模拟前端 token 失效、确认 cookie 恢复后仍保留已绑定 key”。
- 对视频节点与 composer 分辨率预设这类 6 月初新增主线，仓库还缺更细的最小人工检查清单，例如“无绑定时视频节点隐藏、有绑定时可见；`/image` 里切换预设后 payload 不回退到旧字段”。
