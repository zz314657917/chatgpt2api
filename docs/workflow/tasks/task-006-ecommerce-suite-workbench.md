# Task ID
task-006-ecommerce-suite-workbench

# Role
Generator

# Goal
实现“电商套图”独立工作台 v1，复用现有 creation-task 能力完成商品分析、模块图生成、本地历史和汇总图下载。

# Success Criteria
- 顶部导航出现“电商套图”，路由为 `/ecommerce-suite`。
- 默认普通用户可访问该页面；独立模式未登录访问该页面会跳转登录。
- 页面支持最多 2 张商品参考图、商品分析、可编辑运营摘要、8 类固定套图模板和默认 2 张生成。
- 选中模板逐个提交 `image-edits` 任务，轮询并展示独立状态、结果、下载和重试。
- 汇总图由前端 canvas 拼接并下载，不新增后端项目实体或新业务 API。

# Allowed Paths
- `web/src/app/ecommerce-suite/**`
- `web/src/store/ecommerce-suite-projects.ts`
- `web/src/app/route-config.tsx`
- `web/src/app/app-shell.tsx`
- `web/src/app/animated-routes.tsx`
- `web/src/components/top-nav.tsx`
- `web/src/store/auth.ts`
- `internal/service/permissions.go`
- `internal/service/permissions_test.go`
- `internal/service/auth.go`
- `internal/httpapi/app.go`
- `internal/httpapi/app_test.go`
- `docs/workflow/**`

# Denied Paths
- 数据库/持久化 schema
- `internal/httpapi/router.go` 新增业务 API
- creation-task 后端执行链路的大范围重构
- Sub2API 支付/扣费协议

# Constraints
- 不新增后端项目实体。
- 不做 Canvas 节点。
- 不引入新第三方依赖。
- UI 遵循现有 React/Tailwind/shadcn 风格。
- 代码注释如需新增，使用英文。

# Acceptance Commands
- `cd web && npm.cmd run lint`
- `cd web && npm.cmd run build`
- `go test ./...`

# Output
- 变更摘要。
- 执行过的验证命令和结果。
- 未验证风险。

# Stop Rules
- 如果 creation-task 接口签名与计划不兼容，先停止并重新收敛方案。
- 如果需要新增后端 API 或数据库实体，先请求确认。
