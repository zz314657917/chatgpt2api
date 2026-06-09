# Current Task

更新时间：2026-06-08 13:45 +08:00

## 背景

`chatgpt2api` 当前默认续做入口已经再次前移。6 月初的视频节点、composer 分辨率预设、group 节点、图片轻摘要与任务治理，已经从“当前主线”退成稳定背景层；最近 2 天的高频改动集中在：

- `/canvas` workflow 继续收口
- dragged node image reuse
- LLM output / model route 调整
- image/composer shared output controls
- gallery retention notice
- creation task / APIMart task status 稳定性
- AI background removal workflow
- composer models per mode 保持
- node/task state 改变后的名称同步

## 当前主线

当前默认续做入口，不再是“视频节点刚接入”或“Sprint 4 还没关”，而是以下几条已经进入真实产品面的 follow-up：

- `/canvas` 继续向更稳定的 Infinite-Canvas 风格工作流收口，而不是只验证节点能不能创建。
- 图片与画布的输出参数控制已经进入共享层，后续改 `/image` 与 `/canvas` 时要一起看，不再把两边当成独立表单。
- gallery retention notice、拖拽图片复用、每种模式保留 composer model、AI 抠图工作流，说明图片工作台和画布正在从“能跑”推进到“更稳的持续创作体验”。
- creation task / APIMart task status 修复仍然属于当前主线，因为它直接影响运行态、轮询、回填和前端状态可信度。

## 当前结论

- `docs/workflow/status.md` 已经切到 `canvas-image-followups-and-task-stability`，但旧 `knowledge/tasks/current-task.md` 仍停在 2026-06-03 的“视频节点 + composer 分辨率预设”语境，已明显落后于最近一轮主线。
- 当前更值得优先记住的，不是 Sprint 4 历史，而是：
  - `/canvas` workflow 优化
  - dragged node image reuse
  - shared output controls
  - gallery retention notice
  - creation task / APIMart task status 稳定性
  - AI background removal workflow
  - composer 按模式保留模型
  - 节点名称随任务状态同步

## 已稳定事实

- `/canvas` 当前不是独立后端系统，而是复用既有图片库、creation tasks、权限和模型路由的前端工作台。
- `/image` 与 `/canvas` 的输出控制现在要按共享参数层理解；只改一边而不看另一边，回归风险会明显上升。
- 没有 Sub2API 绑定时视频模型 fail-closed 隐藏，这条约束仍然有效，但它已经不再代表 6 月 8 日最靠前的主线。
- gallery retention、拖入图片复用、APIMart 任务状态安全轮询、official Sub2API image batch 拆分，已经共同构成这轮运行态稳定性的默认背景。

## 下一步

- 如果继续做 `/canvas` 或 `/image`，先按 `docs/workflow/status.md` 的当前 Sprint 理解任务，不要再从 6 月 3 日的视频节点阶段开始恢复。
- 如果继续补稳定知识，优先把“background removal + shared output controls + task stability + canvas followups”作为当前默认主线，而不是继续扩写旧 Sprint 4 记录。
- 如需阶段历史，追加到 `knowledge/tasks/timeline.md`；本文件只保留当前默认续做快照。

## 证据入口

- 最近主线提交：
  - `959275b` `chore: sync workflow docs and task coverage`
  - `7ce957e` `feat: use AI background removal workflow`
  - `09fedd5` `fix(canvas): sync node names after task state changes`
  - `69a1fe0` `fix(image): keep composer models per mode`
  - `d86e514` `fix: stabilize creation tasks and frontend build`
  - `31971d4` `fix(httpapi): split official sub2api image batches`
  - `99b27dd` `fix(canvas): avoid duplicate run insight status`
  - `d90976f` `fix(canvas): reuse dragged node images`
  - `1f9d2b8` `feat(canvas): improve model routes and llm output`
  - `fee72e3` `fix(httpapi): poll apimart task status safely`
  - `6530ff9` `feat(canvas): optimize infinite canvas workflow`
- 当前 workflow 入口：`docs/workflow/status.md`
- 手工验收入口：`knowledge/07-canvas-manual-checklist.md`
