### PASS: task-035-seedream-image-profiles

# Task 035 Contract Review

## Findings
- APIMart 四个 Seedream 官方页面已于 2026-08-27 实时核对，能力差异要求独立 profile：4.0 支持 1K/2K/4K，4.5 仅 2K/4K，5.0 Lite 支持 2K/3K/4K 与组图，5.0 Pro 固定单图并最多 10 张参考图。
- 当前代码已有 4.x Seedream bridge 和 15 张输入/输出总量常量，但公共目录缺少 5.0、任务服务上限为 10，且通用尺寸转换会损失 Seedream 参数语义。
- 下游已支持 seedream-5-0-lite/seedream-5-0-pro 基础字段，4.x 仍只识别 doubao-seedance-4-0/4-5；contract 正确保留 4.x ID，并将 Pro 高级能力 deferred。
- Allowed Paths 覆盖模型目录、HTTP payload/校验、任务数量 profile、四个前端入口和断言；Sub2API、计费、鉴权、数据库、部署和 Docker 明确排除。
- Acceptance 覆盖 profile 上限、payload 禁发字段、前端构建、全量 Go 和浏览器 mock，足以验证本地契约。

## Risks Carried Forward
- 无真实 APIMart Token，不能证明真实排队、审核、图片产物、报价或计费。
- 15 张任务必须在服务层按模型读取上限，不得放宽其它图片模型。
- 工作树已有大量未提交改动，本 review 只允许 Task-035 hunk。

## Decision
- Contract PASS，允许进入 build；沿用 codex-direct。

## Amendment 1 Review (2026-08-28)
- `app.go`/`app_test.go` 是 multipart 图片编辑参数进入任务 payload 的唯一入口，纳入范围是完成 Seedream 字段传播所必需。
- Arena 能力表、Agent 断言和输出格式控件为现有前端契约的实际所有者，新增路径均精确到文件，不扩大到目录。
- 新增路径不触及 Sub2API、计费、鉴权、数据库、部署或 Docker，Acceptance 与 Stop Rules 不变。
- Amendment 1：PASS。
