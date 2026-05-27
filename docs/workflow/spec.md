---
repo: chatgpt2api
project_type: web
qa_mode: browser
last_verified: 2026-05-26
---

# Product Spec

## 一句话需求
- 将 `/canvas` 长期开发纳入 P/G/E 门禁，并先把 Infinite-Canvas 风格节点画布的核心交互稳定下来。

## 目标与非目标
- 目标：`/canvas` 作为站内图片创作工作台，复用现有图片库、`creation-tasks`、权限、计费和 Sub2API 模型路由。
- 目标：图片、Prompt、API生成、Output 继续作为可拖拽节点，连线表达输入和输出关系，节点内完成主要参数编辑。
- 目标：右侧图片库和画布节点预览可优先用缩略图，编辑、裁剪、图生图提交必须读取原图引用。
- 非目标：不引入 ComfyUI、GPU worker、RunningHub、视频生成运行时或 Infinite-Canvas 代码。
- 非目标：Sprint 1 不新增后端接口、不改权限模型、不做旧画布迁移。

## 关键约束
- 技术约束：节点数据不能保存 API key、base_url、group_id；图片本体继续由图片库和对象存储管理。
- 技术约束：前端实现遵循当前自研智能画布结构，不回退 React Flow。
- 交付约束：每个 Sprint 必须有 contract、命令验证和浏览器验收项。
- 交付约束：当前分支存在未提交 `/canvas` 改动，后续实现必须在现有改动上增量处理，不回滚。

## 技术方案
- 架构说明：前端 `/canvas` 负责节点编辑、连线、上传、自动保存、任务提交和轮询；生成继续调用现有 `creation-tasks/image-generations` 与 `creation-tasks/image-edits`。
- 关键模块：`web/src/app/canvas/use-smart-canvas-controller.ts` 负责数据流和交互控制，`canvas-node.tsx` 负责画布节点 UI，`canvas-utils.ts` 负责数据归一化和引用策略。

## Sprint 计划
- Sprint 1：核心交互稳定，覆盖图片引用去重、图片库输入行为、连线输入、生成状态、Output 回填、基础保存和浏览器验收。
