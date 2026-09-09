# Current Task

最后更新：2026-09-09

## 当前目标
- Task-036：按 APIMart GPT Image 2.5 文档新增 Flare/Sunburst 网站参数设置。
- Contract：docs/workflow/tasks/task-036-gpt-image-2-5-profiles.md。
- 当前阶段 done；本轮功能在本地源码与 mock 验证范围内 PASS。

## 已完成
- 模型目录、15 比例、精确像素、1K/2K/4K、六档质量、n<=4、最多16张参考图。
- PNG/JPEG/WebP、JPEG/WebP 压缩、背景与审核；默认 low，透明 JPEG 本地拒绝。
- 图片页、Canvas、电商套图、Image Arena 参数传播和保存恢复。
- 2.5 生成/编辑均走 JSON images/generations，参考图复用签名公共 URL；不发 response_format/mask/其他模型专属字段。

## 验证证据
- 定向与全量 Go、前端 lint（0 errors）、build、限定 diff 检查通过。
- E:/task036-browser.mjs：四入口 browser mock；Go 测试覆盖签名参考图完整任务链路。
- E:/task036-asserts.mjs：6 组关联前端断言通过，新增 2.5 设置断言通过。
- 既有 image-model-settings.assert.ts Midjourney repeat=1 期望 undefined，但实现为2；HEAD 原始实现/测试同样失败，未改该业务行为，不能称全体前端断言通过。
- 完整报告：docs/workflow/qa-reports/task-036-gpt-image-2-5-profiles-qa.md。

## 工作区与边界
- 提交前基线为 f04f91436d2078a4b34b98d8711ef7abaa4080bf；用户已授权整理 Task-036 并提交推送至 origin/main，最终结果以 Git 历史与远程核验为准。
- 保留 .codex-build/、.codex-vite-err.log、.codex-vite-out.log。
- 未使用真实 APIMart Token/付费额度；未修改计费、鉴权、数据库、Docker 或部署。

## 下一步
- 完成提交推送后核验 HEAD 与 origin/main 一致；后续按用户新需求继续。
- 如需生产生效，需单独执行部署和运行态验证；当前结果不代表运行实例已更新。
