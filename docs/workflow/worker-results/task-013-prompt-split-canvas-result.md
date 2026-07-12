### DONE: task-013-prompt-split-canvas

# Worker Result

## Task ID
task-013-prompt-split-canvas

## Status
done

## Summary
- Added owner-scoped persistent prompt-split batches with strict prompt-array validation, `nodes` and `direct` orchestration, cancellation, idempotent internal task IDs, and direct child `n=1` submission through the existing creation-task and billing path.
- Reworked the Canvas AI prompt node into a `330 x 260` mini node with dialog-based full input and split details, template validation, direct task binding, and terminal-batch recovery fan-out.
- Contract success criteria are partially met: browser-close and persisted unsubmitted-child recovery work, but a process restart cannot safely resume an already running underlying creation task without a core task-service change.

## Changed Files
- `internal/service/prompt_split.go`
- `internal/service/prompt_split_test.go`
- `internal/httpapi/app.go`
- `internal/httpapi/routes.go`
- `internal/httpapi/prompt_split.go`
- `internal/httpapi/prompt_split_test.go`
- `web/src/lib/api.ts`
- `web/src/app/canvas/types.ts`
- `web/src/app/canvas/canvas-utils.ts`
- `web/src/app/canvas/canvas-node.tsx`
- `web/src/app/canvas/use-smart-canvas-controller.ts`

## Commands Run
```text
gofmt -d internal/service/prompt_split.go internal/service/prompt_split_test.go internal/httpapi/prompt_split.go internal/httpapi/prompt_split_test.go internal/httpapi/app.go internal/httpapi/routes.go -> PASS
go test ./internal/service ./internal/httpapi -run "PromptSplit" -count=1 -> PASS
go test ./internal/service ./internal/httpapi -count=1 -> PASS
cmd.exe /d /s /c "cd /d F:\\java\\chatgpt2api\\web && npm.cmd run lint" -> PASS
cmd.exe /d /s /c "cd /d F:\\java\\chatgpt2api\\web && npm.cmd run build" -> PASS
```

## Risks
- `ImageTaskService` marks queued/running tasks as interrupted during process startup. Replaying them could duplicate upstream work or billing because durable request-dispatch acknowledgement is not currently available.
- Direct task IDs use a deterministic internal hash namespace to prevent normal creation-task ID collisions; an intentionally crafted same-owner collision remains a defense-in-depth concern outside the Canvas UI path.

## Knowledge Candidates
- none

## Contract Compliance
- allowed_paths_only: `yes`
- denied_paths_touched: `no`
- success_criteria_met: `partial`
- stop_rules_triggered: `yes: safe restart of active creation tasks requires core ImageTaskService and billing-recovery design`

## Blocked Reason
- A complete service-restart continuation guarantee requires a durable dispatch/reconciliation contract for active upstream tasks. That crosses the approved task boundary into shared task lifecycle and billing behavior.
