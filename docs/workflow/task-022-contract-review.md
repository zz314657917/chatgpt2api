### PASS: task-022-generator-style-actions-layout

- 问题仅是 full 图片生成节点的局部 JSX 布局，现有样式复制/粘贴控制器和持久化字段无需变更。
- 将操作栏置于参数控件之后可移除 Prompts 上方的视觉断层，同时保留 Task-021 的内容自动增高与 wheel 隔离边界。
- browser QA 将继续通过稳定的 `复制样式` / `粘贴样式` 可访问名称验证交互，并补充位置与窄宽度无横向溢出检查。
