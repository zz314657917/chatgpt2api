### PASS: task-034-grok-imagine-image-2-profile

# Task 034 Contract Review

## Verdict
`PASS`

## Findings
- 用户给出 APIMart 官方 Grok Imagine Image 2.0 文档并明确要求“更新”，已构成从当前 1.5 实现升级到 2.0 的授权。
- 2026-08-27 实时文档证据明确给出单一 `images/generations` 接口、固定模型名、14 种比例、1K/2K、1–10 张输出、最多 3 张参考图、条件性 `quality` 和 `nsfw_check`。
- 当前源码证据显示 1.5 仍拆分生成/编辑别名且参考图上限为 1，因此 contract 的模型替换、统一 endpoint、参数映射和前端联动均属于必要范围。
- Allowed Paths 覆盖模型目录、后端路由/payload/校验、前端公共参数、各图片入口的状态传播和对应断言；Sub2API、计费、鉴权、数据库、部署与 Docker 被明确排除。
- Contract 直接删除 1.5 alias，不引入 fallback 或兼容分支，符合仓库当前 API 与无兼容层原则。
- 验收覆盖定向 Go、相关包、全量 Go、前端 lint/build、差异检查和浏览器请求体联动，足以验证本地实现契约。

## Risks Carried Forward
- 本 Sprint 保持现有 chatgpt2api -> Sub2API 异步任务架构；APIMart 文档推荐的响应版本头、幂等 Key 与个性化报价由现有下游网关负责，不在本仓库本次参数 profile 中另建一套实现。
- 没有真实 APIMart Token 时，只能证明本地 payload 和 UI 契约，不能声称真实付费生成、审核成本、报价或最终图片已验证。
- 工作区已有大量未提交改动且多个允许路径与旧 Sprint 重叠；实现必须采用精确补丁并保留全部无关 diff。

## Contract Amendment Review
- `2026-08-27`: Allowed Paths 与差异检查补入既有 `web/src/lib/image-arena/image-arena.assert.ts` 和 `web/src/app/canvas/canvas-utils.assert.ts`，仅用于落实原 Success Criteria 中已批准的 Image Arena 参数一致性断言，并同步 Canvas 目录从旧 1.5 fixture 到 2.0；未扩大产品行为、外部系统或部署范围。复审结论：`PASS`。
- `2026-08-27`: Allowed Paths 与差异检查补入 `web/src/app/image/page.tsx` 和 `web/src/lib/image-arena/image-arena-agents.ts`。前者仅隔离 Grok 与 Gemini Flash 专属搜索参数，后者仅在既有 Arena agent 设置规范化链路中保留已批准的 Grok `nsfw_check`；均直接服务原 Success Criteria，未扩大外部系统、计费或部署范围。复审结论：`PASS`。
