### DONE: task-018-semantic-prompt-split

## Changed Files

- Prompt-split service/parser tests and HTTP tests.
- Canvas API types, persisted item normalization, controller sync and AI prompt detail UI.
- Existing Canvas browser smoke and Task-018 workflow artifacts.

## Result

- splitter chat contract now requires strict `variation_axis + items[{variant_label,prompt}]` JSON and defines count precedence, single-variant, explicit-list, multi-axis and group-composition rules.
- Service validates exact fields/count, normalized label and prompt uniqueness, persists semantic metadata and exposes it from GET/POST batch responses.
- Canvas saves and restores the axis and labels, displays them only in the details dialog, and keeps fan-out prompts/direct image tasks unchanged.
- Task-017 failed-rerun behavior remains covered in the shared browser smoke.

## Verification

- `go test ./internal/service ./internal/httpapi`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS.
- Canvas browser smoke: PASS, 11/11.
- `go test ./...`: PASS after one unrelated async billing test timing retry.
