### DONE: task-033-remove-local-image-content-policy

## changed files

- `internal/protocol/api.go`: removed local keyword-policy prechecks from image generation, edit, chat image, streaming chat image, and Responses image-tool request construction.
- `internal/protocol/api_test.go`: replaced the local-rejection assertion with direct image-generation and Responses image-tool pass-through coverage for `premium cultural creative desktop ornament`.
- `internal/service/image_content_policy.go`: removed local keyword rules, policy-text collection, punctuation/space normalization, and rule matching while preserving upstream policy and image-size error normalization.
- `internal/service/image_content_policy_test.go`: removed tests for the deleted local precheck.
- `internal/service/image_task.go`: removed local prechecks before generation, edit, billable chat-image, video, and metadata-backed creation-task submission.
- `internal/service/image_task_test.go`: verifies generation, edit, billable chat-image, and video tasks queue and complete with the former cross-word prompt.
- `internal/httpapi/app_test.go`: under approved Amendments 1 and 2, updates direct/creation-task/Responses local-rejection assertions and makes the Social Project partial-failure case use an existing RPM limit with a normal second prompt while retaining cancellation and persistence assertions.

## commands run

- `gofmt -w internal/service/image_content_policy.go internal/service/image_content_policy_test.go internal/service/image_task.go internal/service/image_task_test.go internal/protocol/api.go internal/protocol/api_test.go`
- `go test ./internal/service -run "Test(ImageTaskService|NormalizeImage|RemoveLocalImage|LocalImage)" -count=1`
- `go test ./internal/protocol -run "Test(HandleImage|NewImageGenerationError|RemoveLocalImage|LocalImage)" -count=1`
- `go test ./internal/service ./internal/protocol ./internal/httpapi -count=1`
- `go test ./...`
- `go test ./internal/httpapi -run "Test(CreationTaskQueuesLocalPolicyKeywords|DirectImageGenerationPassesLocalPolicyKeywordsToExistingExecution|ResponsesImageGenerationPassesLocalPolicyKeywordsToExistingExecution)$" -count=1`
- `go test ./internal/httpapi -run "TestSocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure$" -count=1`
- `rg -n "ValidateImageContentPolicy|imageContentPolicyRules|normalizeImagePolicyText|appendPolicyTexts|imageContentPolicyRuleMatches|imageContentPolicyRule" internal/service internal/protocol`
- `git diff --check -- internal/service/image_content_policy.go internal/service/image_content_policy_test.go internal/service/image_task.go internal/service/image_task_test.go internal/protocol/api.go internal/protocol/api_test.go internal/httpapi/app_test.go`

## test output

- PASS: `go test ./internal/service -run "Test(ImageTaskService|NormalizeImage|RemoveLocalImage|LocalImage)" -count=1` (`ok chatgpt2api/internal/service 1.973s`).
- PASS: `go test ./internal/protocol -run "Test(HandleImage|NewImageGenerationError|RemoveLocalImage|LocalImage)" -count=1` (`ok chatgpt2api/internal/protocol 0.534s`).
- PASS: local-policy symbol scan returned no matches; scoped `git diff --check` returned no whitespace errors.
- BLOCKED (initial run): `go test ./internal/service ./internal/protocol ./internal/httpapi -count=1` and `go test ./...` could not compile the embedded web package because `internal/web/web.go:14:12: pattern all:dist: no matching files found`.
- BLOCKED (after the controller supplied ignored `internal/web/dist` test assets without changing tracked frontend files): both commands compile, but `internal/httpapi` fails only in stale local-policy expectations from `internal/httpapi/app_test.go`: `TestCreationTaskRejectsBlockedImagePrompt`, `TestDirectImageGenerationRejectsBlockedPrompt`, and `TestResponsesImageGenerationRejectsBlockedPrompt`. The removed precheck now lets requests enter their normal queue/upstream paths, so those assertions receive `200` queued or `502 upstream_error` instead of the previous local policy rejection.
- PASS (Amendment 1): the three approved replacement HTTP tests pass with `go test ./internal/httpapi -run "Test(CreationTaskQueuesLocalPolicyKeywords|DirectImageGenerationPassesLocalPolicyKeywordsToExistingExecution|ResponsesImageGenerationPassesLocalPolicyKeywordsToExistingExecution)$" -count=1`.
- BLOCKED (final reruns): three-package and full-suite commands now fail only at `TestSocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure` in `internal/httpapi/app_test.go:2908`. Its partial-failure fixture assumes a second card prompt containing `生成血腥肢解的暴力画面` is locally rejected; after removal, both cards are queued. Amendment 1 authorizes only the prior three named assertions, so this worker did not change the fourth stale assertion.
- PASS (Amendment 2): `TestSocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure` now sets the existing user RPM test limit to one, submits ordinary prompts, and confirms the first submitted task is persisted then cancelled after the second submission is rate-limited.
- PASS (final): `go test ./internal/service ./internal/protocol ./internal/httpapi -count=1` (`service 4.914s`, `protocol 0.413s`, `httpapi 17.305s`) and `go test ./...` both pass.

## risks

- Real upstream policy responses were not invoked; existing unit coverage confirms their local error normalization remains intact.

## contract compliance

- Only Allowed Paths were modified. Amendments 1 and 2 explicitly authorized the four dependent `internal/httpapi/app_test.go` assertion updates; production HTTP API code was not changed. Existing untracked Task-033 workflow invocation artifacts were preserved.
- No local `ValidateImageContentPolicy` no-op layer remains; all local keyword rules, text normalization, and context scanning were deleted.
- `ImageContentPolicyError`, `NormalizeImageRequestError`, upstream policy detection, image-too-large normalization, task terminal-error handling, and billing/settlement code were retained.
- No upstream policy error was swallowed, rewritten as success, or bypassed. No denied source path, deployment, database, billing, authentication, storage, Sub2API, or knowledge file was changed by this worker.

## knowledge_candidates

- None. The missing `internal/web/dist` prerequisite is worktree-local validation setup, not a stable project knowledge candidate.
