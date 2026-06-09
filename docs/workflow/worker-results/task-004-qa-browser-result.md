### PASS: task-004-qa-browser

## Scope
- QA repo: `F:/java/chatgpt2api`
- Cross repo: `F:/mcplugins/sub2api`
- Mode: local browser smoke with a mock Sub2API studio bridge.
- Evidence dir: `F:/java/chatgpt2api/docs/workflow/evidence/task-004-qa-browser/`

## Findings
- PASS: 未登录访问 `/image` 会进入落叶AI登录跳转链路；最终浏览器证据记录到 `/login -> /auth/sub2api/launch?token=qa-token -> /image`。
- PASS: mock Sub2API launch token 回跳后进入 `/image`。
- PASS: 登录后右上角余额 `¥123.45` 和 `充值` 入口可见。
- PASS: 普通用户 `/image` 和 `/profile` 页面未出现 `API Key`、`Token`、`OpenAI-compatible`、`API 选择` 禁用文案。
- PASS: `/profile` 中 `使用记录`、`团队空间`、`创建团队`、`加入团队`、`个人空间`、`切换` 基本界面可见。

## Executed Checks
- `Get-Content F:/java/chatgpt2api/docs/workflow/status.md`
- `Get-Content F:/java/chatgpt2api/docs/workflow/tasks/task-004-qa-browser.md`
- `Get-Content F:/java/chatgpt2api/docs/workflow/spec.md`
- `Get-Content F:/java/chatgpt2api/docs/workflow/worker-results/task-002-luoye-backend-result.md`
- `Get-Content F:/java/chatgpt2api/docs/workflow/worker-results/task-003-luoye-frontend-result.md`
- `Get-Content F:/mcplugins/sub2api/docs/workflow/worker-results/task-001-sub2-studio-bridge-result.md`
- `rg -n "studio-bridge|redeem|user-summary|charges/(reserve|commit|refund)|recharge_url|usage_url|launch_url" F:/mcplugins/sub2api/backend F:/java/chatgpt2api/internal`
- `rg -n "API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择|限制 API|接口调用|\\bAPI\\b" ...` on ordinary-user frontend paths; no matches.
- `go test ./...` in `F:/java/chatgpt2api`: PASS.
- `npm.cmd run lint` in `F:/java/chatgpt2api/web`: PASS, 0 warnings/errors.
- `npm.cmd run build` in `F:/java/chatgpt2api/web`: PASS.
- `git diff --check` in `F:/java/chatgpt2api`: PASS with Windows LF -> CRLF warnings only.
- `go test ./...` in `F:/mcplugins/sub2api/backend`: PASS.
- `npm.cmd run build` in `F:/mcplugins/sub2api/frontend`: PASS with existing Vite/Browserslist/DEP0190/chunk warnings.
- `git diff --check` in `F:/mcplugins/sub2api`: PASS.
- Started mock bridge on `127.0.0.1:18081` and chatgpt2api on `127.0.0.1:18082` with temporary `CHATGPT2API_ROOT`.
- `NODE_PATH=C:\Users\Administrator\AppData\Roaming\npm\node_modules node docs/workflow/evidence/task-004-qa-browser/browser-smoke.cjs`: PASS.

## Evidence
- `browser-smoke-result.json`: final structured Playwright result.
- `image-authenticated.png`: authenticated `/image` smoke screenshot.
- `profile-team.png`: profile/team smoke screenshot.
- `browser-smoke.spec.cjs`: smoke script used for local browser verification.

## Unverified Risks
- Real Sub2API production login, real user registration, and real payment/recharge were not verified; this run used a local mock bridge and no production secrets.
- Real Sub2API payment order creation/callback and live recharge URL behavior were not verified.
- Real creation billing reserve/commit/refund against production Redis/DB was not exercised from a generation task.
- Team create/join/switch backend mutations were not submitted in this smoke; this QA verified basic visibility of the UI controls only.

## Recommendation
- Browser QA gate can be marked PASS for local mock bridge coverage. Keep production Sub2API login/payment/charge verification as deployment-stage checks because they require real domains, secrets, and payment configuration.
