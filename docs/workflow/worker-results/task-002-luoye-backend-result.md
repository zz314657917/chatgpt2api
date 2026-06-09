### DONE: task-002-luoye-backend

## Changed Files
- `internal/config/config.go`
- `internal/httpapi/app.go`
- `internal/httpapi/app_test.go`
- `internal/httpapi/router.go`
- `internal/httpapi/routes.go`
- `internal/httpapi/sub2api.go`
- `internal/httpapi/team.go`
- `internal/service/image_task.go`
- `internal/service/permissions.go`
- `internal/service/sub2api_launch.go`
- `internal/service/team.go`
- `docs/workflow/worker-results/task-002-luoye-backend-result.md`

## Summary
- Added Luoye independent mode config via env, including Sub2API default chat/image/video group IDs.
- Disabled local user login/register and personal API-token routes for non-admin users in independent mode.
- Extended Sub2API launch/session support with balance, usage, default group binding, and internal reserve/commit/refund calls.
- Added system-default Sub2API routing for creation tasks when no user API key binding exists.
- Added external billing hook to creation tasks so independent Sub2API tasks reserve before execution, commit successful consumed output, and refund failed/cancelled unused reservation amounts with idempotent charge keys.
- Added team v1 backend service and routes for create, invite join, close invite, remove member, switch/list current space.
- Creation tasks now persist `team_id`, `payer_user_id`, and `actor_user_id`; team tasks use owner as payer and member as actor.
- Added Go tests for independent local auth blocking, default group + billing flow, and team v1 task context.

## Commands Run
- `gofmt -w internal/config/config.go internal/service/team.go internal/service/image_task.go internal/service/sub2api_launch.go internal/service/permissions.go internal/httpapi/app.go internal/httpapi/routes.go internal/httpapi/router.go internal/httpapi/sub2api.go internal/httpapi/team.go`
- `go test ./...`
- `gofmt -w internal/httpapi/sub2api.go && go test ./...`
- `gofmt -w internal/httpapi/app.go && go test ./...`
- `gofmt -w internal/httpapi/app_test.go && go test ./internal/httpapi`
- `go test ./...`
- `git diff --check`

## Test Output
- `go test ./...`: PASS
- `git diff --check`: PASS with line-ending warnings only; no whitespace errors.

## Risks
- Sub2API bridge endpoints are implemented against the expected task-001 contract paths: `balance`, `usage`, `billing/reserve`, `billing/commit`, `billing/refund`. Cross-repo runtime verification is still needed after the Sub2API bridge worker lands.
- System default group routing sends an internal studio bridge secret, `X-Sub2API-Group-ID`, and `group_id`; upstream must accept this internal gateway contract.
- Independent mode is gated by `CHATGPT2API_LUOYE_INDEPENDENT_MODE=true`; existing explicit user API key bindings still work to preserve old managed capability.
- Team v1 intentionally has simple owner/member behavior only; no granular team roles, budgets, approval flow, or ownership transfer.
- Existing worktree already had unrelated `web/src/**`, workflow doc, and knowledge changes before this worker report; this worker did not modify `web/src/**`.

## Unable To Verify
- Browser UI hiding of API concepts is out of scope for backend worker and requires task-003/task-004.
- Real Sub2API reserve/commit/refund idempotency needs cross-repo integration verification.
- Real recharge URL and remote usage record presentation depend on Sub2API bridge response shape.

## Knowledge Candidates
- Luoye independent mode backend should prefer explicit Sub2API API key bindings when present, and only fall back to system default group routing in independent mode without a user binding.
