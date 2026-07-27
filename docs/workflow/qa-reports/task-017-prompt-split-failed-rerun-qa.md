### PASS: task-017-prompt-split-failed-rerun

## Findings

- 未发现阻断问题。
- 失败 `0/5` 后重试不再误弹“如何处理上一批节点”。
- 成功批次重跑仍显示保留、替换和取消，既有保护语义未回退。

## Executed Checks

- `npm.cmd run lint`：PASS，0 warnings / 0 errors。
- `npm.cmd run build`：PASS。
- `QA_SCENARIO='failed split rerun'` browser smoke：PASS。
- 完整 Canvas browser smoke：PASS，11/11。
- `git diff --check`：PASS，仅 Windows LF/CRLF 提示。

## Unverified Risks

- 本次 browser QA 使用 mock 拆分失败响应，没有消耗真实上游模型额度。

## Recommendation

- Task-017 可更新本地容器并交付验证。
