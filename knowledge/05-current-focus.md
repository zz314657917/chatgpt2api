---
title: Current Focus
type: status
repo: chatgpt2api
last_verified: 2026-05-31
---

# 当前稳定心智模型

chatgpt2api 当前不应再被理解为单纯“ChatGPT 官网能力封装服务”。最近稳定主线已经从 5 月 22 日前后的 image workspace / white-label / leaf login，进一步推进为“现有图片服务能力 + 自研 `/canvas` 节点画布工作台”的双层产品面。

- 面向 Sub2API 的独立生图工作台。
- 面向被跳转用户的 white-label profile experience。
- 面向 `leaf network` / `linux.do` 入口的本地登录态承接。
- 面向图像创作链路的 `/canvas` 自研节点画布。

## 当前主线

- `Sub2API launch/redeem -> 本地登录态 -> /image 工作台 -> creation tasks / image tasks -> 本地或对象存储图片访问` 已经成为默认产品链路。
- 2026-05-30 的近期修复已经把 `embedded session recovery + bound Sub2API key preservation` 进一步推进成这条链路的稳定默认约束，而不只是 launch 页或登录页的小修。
- 图片工作台最近继续推进了“连续编辑”和“继续创作”体验，而不是停在第一版单次生成。
- `/canvas` 已从 React Flow 试验版切到自研画布，当前默认理解是复用既有图片库、`creation-tasks`、权限体系和 Sub2API 模型路由，而不是引入 ComfyUI 或新 GPU 工作流。
- 当前 `/canvas` 交互已经收口为 Infinite-Canvas 风格的节点式图片创作工作台：保留全局顶部导航，左侧功能导航，顶部节点工具条，以及 `image`、`prompt`、`image_generation`、`result` 节点组合。
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
- 当前 embedded mode 默认还要满足以下会话约束：
  - stale token 或前端 store 失效后，允许从 cookie 恢复嵌入会话，而不是直接把用户打回匿名态。
  - 从 Sub2API launch 进入时，已绑定的 Sub2API API key 不应在 session 初始化过程中被覆盖、清空或误判成未绑定。
  - 嵌入模式下的认证保持优先级高于主题 reveal、provider 名称提示等纯展示体验；后者可以降级，认证连续性不能退化。
- 管理端异步创作任务资源仍以 `/api/creation-tasks` 为根，并通过 `image-generations`、`image-edits`、`chat-completions` 等子资源表达场景。
- `/canvas` 当前仍是“复用现有能力的前端工作台”，不是独立后端系统：
  - 节点数据不保存 API key、`base_url`、`group_id`。
  - 图片本体继续由现有图片库和对象存储管理，画布只保存引用。
  - API 生成节点继续复用现有图片生成/编辑任务链路，不单开新调度后端。
- 当前 `/canvas` 默认约束还包括：
  - 已保存的空智能画布保持空白，不再每次加载都强行补默认节点。
  - 生成节点 queued/running 时禁用重复提交，并在重新打开画布时恢复轮询。
  - 运行时如果没有 `result` 下游，会自动创建并连线。

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
  - `web/src/app/canvas/page.tsx`
  - `web/src/app/canvas/use-smart-canvas-controller.ts`
  - `web/src/app/canvas/canvas-node.tsx`
  - `web/src/app/canvas/canvas-utils.ts`

## 当前剩余重点

1. 把 `/canvas` 的稳定心智从 `current-task`/`timeline` 继续下沉，至少收口“复用 creation-tasks 的节点画布”这层默认约束。
2. 如果继续推进 Sub2API 集成，继续把 launch/redeem、embedded session 恢复、bound key 保持、图片任务、对象存储、`/image` 与 `/canvas` 之间的关系固化到专题知识，而不是只留在提交历史。
3. 如果准备公开说明能力边界，要显式区分“当前已支持的 Sub2API / leaf network 登录、image workspace、canvas workspace”与“尚未支持的 Grok/xAI、ComfyUI、独立 GPU 工作流”。

## 不要误判的点

- 当前不是继续围绕“品牌改名/去掉外链/隐藏本地账号能力”做主线开发；那些更像已完成的白标收口事实。
- 当前也不是通用多模型扩展仓库；最近主线集中在图片工作台、节点画布与 Sub2API 集成。
- 不要把 `/canvas` 误判成引入了 ComfyUI、Infinite-Canvas 代码或新的图像调度后端；当前只是站内已有图片链路上的新工作台。
- 不要把 embedded session / bound key 修复误判成单纯 auth store 小修；它直接影响从 Sub2API 进入 `/image`、`/canvas` 后是否还能保持正确账号身份和路由。
- 仅看 README 和旧任务快照，容易漏掉 per-user retention、continued edit、leaf network login、embedded session recovery、bound Sub2API key preservation、image workspace policy hardening，以及 `/canvas` 自研节点画布这些新默认约束。
