### PASS: studio-bridge-model-scoped-apimart-billing

## Findings
- No blocking defect remains in the scoped executor-side settlement change.
- Fixed-price `gpt-image-2` ignores APIMart task-cost overrides both when computing refund/surcharge and when persisting `billing_consumed_amount`.
- The initial over-broad model rule was corrected after Midjourney/Grok HTTP regression failures; official and other cost-based models retain their existing behavior.

## Executed Checks
- Focused `TestImageTaskServiceExternalBilling...` run covering ordinary higher/lower costs and official cost override -> pass.
- Focused Midjourney edit and Grok generation HTTP regression run -> pass.
- `go test ./internal/service ./internal/httpapi -count=1` -> pass.
- `git diff --check -- internal/service/image_task.go internal/service/image_task_test.go docs/workflow/main-log.md` -> pass.
- Diff precision review -> only settlement policy, focused tests and workflow evidence belong to this task.

## Unverified Risks
- Historical overcharges and surcharge records already reserved before this change were not repaired.
- No real upstream image task or live Sub2API balance was charged.

## Recommendation
- Deploy this executor change before the paired Sub2API validation guard.
- After deployment, smoke one ordinary `gpt-image-2` task and confirm a single fixed-price reserve/commit with no surcharge.
