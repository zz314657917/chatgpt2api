### PASS: task-024-image-task-error-localization

- 用户提供的 `HTTP 400 size: Value error, size must be auto or WIDTHxHEIGHT` 已在图片任务状态中持久化，并因前端未覆盖该模式而直接显示英文。
- 合同将变更限制在现有前端错误本地化入口及其四个消费界面；不改变后端尺寸校验、上游 payload、任务状态、重试或结算语义。
- 使用 `localizeErrorMessage` 作为唯一新增规则的归属，可使 HTTP 提交失败与轮询到的 creation task 失败得到一致文案，同时保持未知错误的原文诊断。
- 验收命令覆盖类型检查、前端构建、后端回归和差异检查；浏览器验收覆盖用户看到的结果卡片与跨界面消费点。
