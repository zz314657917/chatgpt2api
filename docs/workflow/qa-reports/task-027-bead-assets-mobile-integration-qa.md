### PASS: task-027-bead-assets-mobile-integration

# Task-027 拼豆素材与移动端验收

日期：2026-08-05
环境：Vite `http://127.0.0.1:5175`，Chromium headless，受控 `/api/bead-projects` 与 `/api/images` mock。

## Findings

- 最终静态复审发现并修复两项竞态：关闭素材选择器后的迟到详情/Blob 读取，以及另存副本期间的迟到导航。两项均已有脚本回归。
- 未发现 Task-027 合同范围内的阻断问题。

## Executed Checks

- 变更工程后等待 1200 ms，状态从未保存进入已保存；保存期间与路由切换后的旧响应不会污染新工程。
- 个人素材选择和本地原图连续上传只持久化最新 `{path, name, scope}` 引用；关闭选择器后释放迟到请求不覆盖当前引用。
- PNG 导出勾选“保存到个人素材库”后，下载请求与上传请求均完成；回存失败不会改变工程素材引用。
- 409 覆盖取消后显式重试、重新加载云端、另存副本和另存进行中的禁止关闭/重复操作。
- `390x844` 顶部两行操作区、底部工具栏、图层抽屉、无横向溢出及深浅色截图均通过；`1440x900` 桌面三栏截图可见。
- `npm.cmd run lint`、`npm.cmd run build`、`npm.cmd run check:bundle`、拼豆定向 Go 测试和 `git diff --check` 均通过。

## Unverified Risks

- 当前覆盖是前端 mock E2E，未使用真实账号、真实对象存储或真实团队角色；这些不应被表述为生产已生效。
- `workspace-canvas.tsx` 有两条既有 hooks warning，本 Sprint 未扩展该模块。

## Recommendation

Task-027 通过。可以进入 Task-028 全量测试、跨 Sprint 证据复核和最终验收报告。
