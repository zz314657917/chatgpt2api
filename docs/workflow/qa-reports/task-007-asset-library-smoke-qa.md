### PASS: task-007-asset-library-smoke

## Scope

- QA repo: `F:/java/chatgpt2api`
- Cross repo: `F:/mcplugins/sub2api`
- Mode: local browser smoke against `http://127.0.0.1:62080` -> `http://127.0.0.1:8081`
- Evidence dir: `F:/java/chatgpt2api/docs/workflow/evidence/task-007-asset-library-smoke/`

## Findings

- PASS: 素材库核心浏览器 smoke 已完成，`browser-smoke-result.json` 中 `status=PASS` 且 `all_passed=true`。
- PASS: `62080/chat-images` -> `8081/image` Studio Bridge 入口链路可创建 Luoye session。
- PASS: `/image-manager` 覆盖个人 `ui-*` 素材集、按素材集筛选、`未归类` 筛选、移出当前素材集、详情面板“一张图只能属于一个素材集”提示。
- PASS: 团队 manager 可创建并归类团队素材集；普通 member 修改团队素材集返回 `403`；公共素材库修改归类返回只读错误。
- PASS: `/image` 素材库侧栏可显示 `全部 / 未归类 / ui-*` 筛选，并可把素材加入参考图输入。
- PASS: `/canvas` 素材库侧栏可显示同样筛选，并可把素材加入画布，画布节点可见。
- PASS: session-probe iframe 只请求 `/studio-bridge/session-probe`，未请求 `62080/` 根路径，未复现 root-frame CSP 误报。
- PASS: frontend lint/build 与 backend focused tests 均已通过。

## Executed Checks

- PASS: `cd F:/java/chatgpt2api/web && npm.cmd run lint`
- PASS: `cd F:/java/chatgpt2api/web && npm.cmd run build`
- PASS: `cd F:/java/chatgpt2api && go test ./internal/service ./internal/httpapi`
- PASS: `cd F:/java/chatgpt2api && $env:NODE_PATH=(npm.cmd root -g); $env:QA_RUN_ID='final'+(Get-Date -Format 'yyyyMMddHHmmss'); node docs/workflow/evidence/task-007-asset-library-smoke/browser-smoke.cjs`

## Evidence

- `docs/workflow/evidence/task-007-asset-library-smoke/browser-smoke.cjs`
- `docs/workflow/evidence/task-007-asset-library-smoke/browser-smoke-result.json`
- `docs/workflow/evidence/task-007-asset-library-smoke/01-image-after-bridge.png`
- `docs/workflow/evidence/task-007-asset-library-smoke/02-image-manager-ui-collection.png`
- `docs/workflow/evidence/task-007-asset-library-smoke/03-image-manager-unclassified.png`
- `docs/workflow/evidence/task-007-asset-library-smoke/04-image-asset-library.png`
- `docs/workflow/evidence/task-007-asset-library-smoke/05-canvas-asset-library.png`

## Unverified Risks

- Real `gpt-image-2` generation is intentionally out of scope for this smoke and remains optional deployment-stage verification.
- The smoke intentionally treats expected `401` launch/session retries, team-member `403`, and public-scope `400` as non-fatal evidence for auth/permission behavior.

## Recommendation

- 素材库验收闭环可作为 PASS 证据使用；后续上线前可按需追加真实 `gpt-image-2` 生图联调，不阻塞本轮素材库 smoke。
