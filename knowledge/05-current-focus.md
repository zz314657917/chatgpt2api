---
title: Current Focus
type: status
repo: chatgpt2api
last_verified: 2026-05-22
---

# 当前稳定心智模型

chatgpt2api 当前不应再被理解为单纯“ChatGPT 官网能力封装服务”。最近稳定主线已经收口为三个互相耦合的方向：

- 面向 Sub2API 的独立生图工作台。
- 面向被跳转用户的 white-label profile experience。
- 面向 `leaf network` / `linux.do` 入口的本地登录态承接。

## 当前主线

- `Sub2API launch/redeem -> 本地登录态 -> /image 工作台 -> creation tasks / image tasks -> 本地或对象存储图片访问` 已经成为默认产品链路。
- 图片工作台最近继续推进了“连续编辑”和“继续创作”体验，而不是停在第一版单次生成。
- 白标化重点是收敛用户感知入口和个人页，不让从 Sub2API 跳转来的用户误以为还要在 chatgpt2api 内重复维护本地账号体系。
- 最近新增的 leaf network launch login 说明登录页本身也已进入产品主线，不再只是被动承接 Sub2API 跳转；默认心智里应包含“特定上游入口换取本地登录态”的链路。

## 已稳定结论

- 当前项目仍不支持 `SuperGrok` / `Grok` / `xAI`；如果要支持，属于新增集成决策。
- `image` 相关默认心智已经包含：
  - 创建聊天时保留 draft。
  - 生成结果可拖回编辑器继续编辑。
  - continued edits 使用本地结果 URL，而不是依赖外部临时地址。
  - 每用户图片保留上限已经收口为稳定配置约束。
  - image workspace policies 已进一步 harden，不应再把早期宽松行为当默认。
- 当前产品线里，`white label profile experience` 是收口项，不再是唯一主线；真正需要优先理解的是 image workspace 与 Sub2API 集成链路。
- 登录入口当前至少要区分普通本地登录与 leaf network / linux.do launch login，不应再把登录页当成纯静态表单。
- 管理端异步创作任务资源仍以 `/api/creation-tasks` 为根，并通过 `image-generations`、`image-edits`、`chat-completions` 等子资源表达场景。

## 当前推荐补读路径

- 后端入口：
  - `internal/httpapi/sub2api.go`
  - `internal/service/sub2api_launch.go`
  - `internal/service/image.go`
  - `internal/service/image_task.go`
  - `internal/config/config.go`
- 前端入口：
  - `web/src/app/image/page.tsx`
  - `web/src/app/auth/sub2api/launch/page.tsx`
  - `web/src/lib/api.ts`

## 当前剩余重点

1. 把 image workspace policies、保留上限和最小验证链路从 `current-task`/`timeline` 继续下沉到稳定入口。
2. 如果继续推进 Sub2API 集成，补一份更清晰的 launch/redeem、leaf network login、图片任务、对象存储和前端落点之间的专题知识。
3. 如果准备公开说明能力边界，要显式区分“当前已支持的 Sub2API / leaf network 登录与 image workspace”与“尚未支持的 Grok/xAI”。

## 不要误判的点

- 当前不是继续围绕“品牌改名/去掉外链/隐藏本地账号能力”做主线开发；那些更像已完成的白标收口事实。
- 当前也不是通用多模型扩展仓库；最近主线集中在图片工作台与 Sub2API 集成。
- 仅看 README 和旧任务快照，容易漏掉 per-user retention、continued edit、leaf network login 和 image workspace policy hardening 这些新默认约束。
