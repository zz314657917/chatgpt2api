# Current Task

更新时间：2026-05-18 00:20 +08:00

## 背景

仓库近期已经从“是否支持 SuperGrok + 白标化 UI 调整”这一轮任务，推进到更靠近产品主线的两件事：

1. `feat: white label profile experience`
2. `feat: integrate sub2api image workspace`

也就是这个仓库现在不仅是 ChatGPT Web 能力封装服务，还在向 Sub2API 配套独立生图工作台和白标前台继续收口。

## 当前目标

把 chatgpt2api 当前默认心智明确为“Sub2API 配套独立生图工作台 + white-label profile experience”，而不是仍停留在品牌名改成 `落叶网络`、移除外链和隐藏个人中心本地账号能力这类上一阶段 UI 收尾。

## 本次已完成

- 已完成 `feat: integrate sub2api image workspace`，最近改动覆盖：
  - 后端：`internal/config/config.go`、`internal/httpapi/sub2api.go`、`internal/service/auth.go`、`internal/service/image.go`、`internal/service/image_task.go`、`internal/service/sub2api_launch.go`
  - 前端：`web/src/app/auth/sub2api/launch/page.tsx`、`web/src/app/image/page.tsx`、`web/src/app/route-config.tsx`、`web/src/lib/api.ts`
  - 存储：`internal/imagestore/object_store.go`
- 已完成 `feat: white label profile experience`，最近改动覆盖：
  - 前端：`web/src/app/login/page.tsx`、`web/src/app/profile/page.tsx`、`web/src/components/top-nav.tsx`、`web/src/lib/app-meta.ts`
  - 后端/元信息：`internal/httpapi/app.go`
  - 知识库：`knowledge/00-start-here.md`、`knowledge/tasks/current-task.md`、`knowledge/tasks/timeline.md`

## 已确认事实

- 当前项目仍不支持 SuperGrok/Grok/xAI；如需支持，属于新增集成决策。
- 当前项目主要主线已经是：
  - 用 Sub2API launch/redeem 和用户 API Key 建立独立生图工作台入口。
  - 继续做 white-label profile experience，让被 Sub2API 跳转进来的用户看到更收敛的品牌和个人页。
- `internal/httpapi/app.go`、`internal/httpapi/sub2api.go`、`internal/service/*` 和 `web/src/app/image` / `auth/sub2api/launch` 已经是最近最值得优先补读的路径。
- 之前那轮品牌文字、外链和个人中心收缩结论仍有效，但它们已属于完成的阶段性结果，不再是默认当前主线。

## 待验证点

- Sub2API image workspace 与 white-label profile experience 是否还需要更稳定的专题知识页，而不是继续只靠任务快照累计。
- 如果继续推进 Sub2API 集成，是否需要单独记录 launch/redeem、对象存储、图片任务和前端落点之间的最小验证链路。
- 若后续决定实现 Grok 支持，仍需先联网确认 xAI 官方 API 当前文档和模型能力。

## 当前结论

chatgpt2api 当前应被理解为“白标化后的独立生图工作台服务”，最近的默认主线是 Sub2API image workspace 与 profile experience，而不是继续围绕上一轮品牌改名任务做续写。

## 下一步

- 如继续补知识，优先新增或补齐一份面向 Sub2API 集成的稳定验证说明，收口 launch、登录态、图片任务和对象存储路径。
- 如继续开发，优先补读 `internal/httpapi/sub2api.go`、`internal/service/sub2api_launch.go`、`internal/service/image_task.go` 和 `web/src/app/image/page.tsx`。
- 如只需要保留阶段历史，现有白标化和 profile 收口内容应继续留在时间轴，不必再占用当前任务页主体。

## 验证记录

- 最近两条主线提交及对应改动文件已通过仓库提交记录确认。
- 上一阶段白标化与个人中心收缩的构建/测试记录仍保留在时间轴，可作为补读历史。
