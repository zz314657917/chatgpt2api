### PASS: task-031-canvas-model-contracts

# Task 031 Contract Review

## Verdict
`PASS`

## Findings
- 合同将修复限制在已有 Canvas 请求层和视频 payload bridge；允许复用 `canvas-utils.ts` 作为节点与控制器共享的 profile 来源，不改变模型目录协议、Sub2API 上游接口、计费或鉴权。
- Gemini Flash 的单张限制同时覆盖控件与请求体，可避免 UI 与实际结果不一致。
- 未知视频模型在客户端和服务端双重阻断，已知模型继续沿用既有、已测试的 profile。

## Risks Carried Forward
- 未新增 Apimart 兼容别名和 `official_fallback` 控件；它们不影响规范模型调用，需另行产品决策。
