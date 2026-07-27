### PASS: task-021-generator-node-responsive-parameters

- 问题可在图片生成节点的 full 参数布局和 wheel 边界内解决，不需要修改 API、任务或持久化 schema。
- 使用节点宽度驱动单列、双列和三列重排，可保持控件可读性，同时避免通过字体缩放压缩内容。
- 验收同时覆盖内部滚动、页面默认滚动、Canvas zoom 隔离和空白画布 wheel 回归，可以进入 build。
