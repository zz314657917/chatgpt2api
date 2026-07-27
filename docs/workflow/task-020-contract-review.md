# Task 020 Contract Review

### PASS: task-020-image-tool-text-response-hardening

- Contract 已包含 Task ID、Role、Goal、Success Criteria、Context、Allowed Paths、Denied Paths、Constraints、Acceptance Commands、Output、Stop Rules 和 Budget。
- 计划明确区分“请求声明了 image_generation”与“上游真实产生 `image_generation_call`”，并要求用路由矩阵/脱敏 capture 验证主模型、工具模型、实际路由和出站 payload。
- text-only/no-image-output 的错误归一、Responses 文本诊断、generate/edit creation-task 状态、图片消费数和 `reserve / commit / refund` 幂等均有可执行验收项；chat 合法文本输出被明确保护。
- Allowed Paths 收敛在 backend/protocol/httpapi/service 的协议与测试文件，Denied Paths 覆盖前端、数据库、Sub2API、生产配置和知识库，符合当前 mixed dirty tree 边界。
- 基线命令 `go test ./internal/backend ./internal/protocol ./internal/service ./internal/httpapi -count=1` 已通过；`git diff --check` 无 whitespace 错误。实现后的全量测试、脱敏运行态 capture 和真实上游调用尚未执行，不能提前视为 PASS。

## Open Risks

- 当前 checkout 里 `gpt-5.4-mini`、`gpt-image-2` 和 `codex-gpt-image-2` 的路由/工具模型组合必须以实现阶段的实际出站 capture 定案，禁止根据用户描述或字段存在直接推断。
- Docker/真实账号运行态未验证；若线上仍走旧容器或旧二进制，需在 QA 报告中单独标识部署版本和未验证项。

## Decision

Contract approved，允许进入 build/Generator；本轮不调用 worker，等待用户明确进入实现或继续下一阶段。
