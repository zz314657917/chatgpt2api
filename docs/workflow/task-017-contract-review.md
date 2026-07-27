# Task 017 Contract Review

### PASS: task-017-prompt-split-failed-rerun

- 根因和修改边界明确：上一批处理语义应由实际 fan-out 节点决定，而不是仅由 batch ID 决定。
- 验收同时覆盖失败 `0/N` 直接重试和成功批次重跑弹窗回归。
- 不涉及后端、计费、持久化协议或无关 dirty files，可进入 build。
