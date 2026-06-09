### DONE: task-003-luoye-frontend

## changed files
- `web/src/components/top-nav.tsx`
- `web/src/app/login/page.tsx`
- `web/src/app/profile/page.tsx`
- `web/src/app/image/page.tsx`
- `web/src/app/canvas/canvas-help.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/canvas-presets.ts`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/use-smart-canvas-controller.ts`
- `web/src/lib/api.ts`
- `docs/workflow/worker-results/task-003-luoye-frontend-result.md`

## summary
- 品牌收敛为“落叶创艺”，登录页未登录时展示短暂跳转状态并自动跳转 Sub2API 登录/注册入口。
- 顶部导航保留 `创作台`、`无限画布`、`社媒运营`、`图片库`，右上角改为余额、充值、用户名与三项菜单：个人资料、使用记录、退出登录。
- 移除普通创作台的 Sub2API Key 必选弹窗，画布可见文案从“API生成/API Key”调整为“图片生成/创作权限”等普通用户语义。
- 个人中心新增个人资料、使用记录、团队空间三段；团队空间支持创建团队、复制邀请码、加入团队、个人/团队空间切换、成员基础信息展示。
- `web/src/lib/api.ts` 增加团队 v1 前端 API wrapper 和 Sub2API `recharge_url/usage_url` 字段读取。

## commands run
- `cd web; npm.cmd run lint`
  - result: PASS, `Found 0 warnings and 0 errors.`
- `cd web; npm.cmd run build`
  - result: PASS, `tsc -b && vite build` completed successfully.
- `rg -n "API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择|限制 API|接口调用|\\bAPI\\b" web/src/components/top-nav.tsx web/src/app/login/page.tsx web/src/app/profile/page.tsx web/src/app/image/page.tsx web/src/app/canvas web/src/app/social web/src/app/image-manager`
  - result: PASS, no matches.

## test output
- Oxlint: 0 warnings, 0 errors.
- Vite build: built successfully, 3214 modules transformed.

## risks
- 团队接口按前端 contract 预期接入 `/api/teams`、`/api/teams/join`、`/api/teams/current`；如果 task-002 后端接口字段或路径不同，需要对齐。
- 充值/使用记录入口优先读取 `/auth/providers` 返回的 `sub2api.recharge_url` 和 `sub2api.usage_url`；缺失时会回退到 `launch_url` 或 `https://ai.3zapi.top`。
- `npm.cmd run build` 会按项目配置生成 `../internal/web/dist` 产物；本 worker 未修改 `internal/**` 源码，生成产物不列入 changed files。

## unable to verify
- 未运行真实浏览器登录回跳，因为需要有效 Sub2API 外部登录配置和会话。
- 未验证团队创建/加入/切换的真实后端行为，因为本 worker 禁止修改 `internal/**`，接口依赖 task-002。

## knowledge_candidates
- none
