---
repo: chatgpt2api
project_type: web
qa_mode: browser
last_updated: 2026-06-09
---

# Product Spec

## 一句话需求
- 将 `chatgpt2api` 改造成独立创作站“落叶创艺”：普通用户只走 Sub2API 注册、登录、充值和余额扣费，进入站点后直接使用创作台、无限画布、社媒运营和图片库，不再接触 API Key / Token / OpenAI-compatible / API 选择。

## 目标
- 普通用户未登录访问落叶创艺时，展示短暂跳转提示并跳转到 Sub2API 登录/注册；完成后自动回跳落叶创艺并建立本地会话。
- 充值、余额、使用记录、扣费真源统一在 Sub2API；落叶创艺只做创作体验和任务记录。
- 落叶创艺普通部署隐藏本地管理员登录入口，站点配置统一放到 Sub2API 管理后台。
- 管理员在 Sub2API 中配置落叶创艺应用，包括回跳域名、充值入口、默认聊天/生图/视频分组和内部通信密钥。
- 团队模式 v1 支持创建团队、创建者定向邀请、个人/团队空间切换；团队空间扣队长/团队共享额度，任务记录实际操作者。

## 非目标
- 不彻底删除 chatgpt2api 原管理员后台和维护能力，本轮只在普通部署中隐藏入口。
- 不让普通用户选择或绑定 Sub2API API Key。
- 不做企业级组织、审批流、部门层级、复杂成员权限或精细预算审批。
- 不改支付核心回调逻辑，除非 Sub2API 需要暴露充值入口字段。

## 技术方案
- Sub2API 增加外部创作站 bridge：登录回跳、一次性 launch token、余额/充值/使用记录内部接口、幂等 `reserve / commit / refund` 扣费接口。
- chatgpt2api 增加落叶创艺独立模式：使用 Sub2API launch token 换取本地 session；任务执行前向 Sub2API 预扣，成功确认，失败/取消退款。
- 普通用户 UI 隐藏 API 相关概念；右上角展示用户名、余额、充值按钮，下拉仅保留个人资料、使用记录、退出登录。
- 团队模式数据保存在 chatgpt2api：`team_id` 表示团队空间，`payer_user_id` 表示扣费用户，`actor_user_id` 表示实际操作者。

## Sprint 计划
- `task-001-sub2-studio-bridge`：Sub2API 外部创作站配置、登录回跳、余额/充值/使用记录、幂等扣费接口。
- `task-002-luoye-backend`：chatgpt2api 后端接入 Sub2API 会话/钱包/默认路由并加入团队 v1 服务。
- `task-003-luoye-frontend`：落叶创艺普通用户 UI、隐藏 API 概念、充值与团队管理界面。
- `task-004-qa-browser`：跨仓库命令验证和 Playwright 浏览器验收。
