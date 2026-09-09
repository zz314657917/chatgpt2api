### PASS: task-036-gpt-image-2-5-profiles

## Verdict
Task-036 新增功能在源码、Go 测试和浏览器 mock 范围内 PASS；不是全仓库所有前端断言均通过，既有基线失败见 Findings。

## Contract Checked
- docs/workflow/tasks/task-036-gpt-image-2-5-profiles.md
- docs/workflow/contract-reviews/task-036-gpt-image-2-5-profiles-review.md

## Executed Checks
- 定向 Go：GPTImage25、CanvasImageModel、ImageTaskCount、ImageGenerationModel；PASS。
- go test ./...：PASS（最终修改后的 httpapi、service 重新执行，其余未变包使用 Go 缓存）。
- npm.cmd run lint：0 errors，2 条既有拼豆 hooks warning。
- npm.cmd run build：PASS；保留既有 bundle-size 提示。
- git diff --check：PASS；所有修改路径在 Allowed Paths 内。
- E:/task036-asserts.mjs：api、image-task-request、image-options、canvas-utils、image-arena、image-arena-agents 断言 PASS；新增 2.5 默认审核/去除 mask 断言 PASS。
- E:/task036-browser.mjs：最终退出 0，pageerror 为空。

## Browser Evidence
- 图片页：Flare/Sunburst、15 种比例、1K/2K/4K、六档质量；手动输入 1600x1200，实际任务请求 quality=max、size=1600x1200。
- Canvas：实际请求 n=4、quality=max、WebP、output_compression=73；手动像素入口可见，尺寸请求保持。
- 电商套图：保存后重新加载，5:4、4K、max、WebP、压缩率 67 恢复；参数控件可操作。
- Image Arena：生图模式可选 Flare，显示 2.5 背景/审核面板，无 mask；浏览器内 adapter + task API 参考图 mock 请求保留 5:4、4k、n=4、WebP 压缩率 61。
- 截图：output/playwright/task036-image.png、task036-canvas.png、task036-ecommerce.png、task036-arena.png（本地测试产物）。
- Go 模拟 HTTP 网关验证生成与编辑均使用 images/generations，不发 response_format；两模型临时参考图经本地模拟对象存储签名，任务成功，image_urls 保留签名 URL。

## Findings
- 已修复：2.5 的 1k 不再被任务 metadata 归一成 1080p；默认审核 low；精确像素输入允许逐字编辑；混合参考图复用完整上传转换链路。
- 基线问题：image-model-settings.assert.ts 的 Midjourney repeat=1 断言期待 undefined，而既有 normalizer 归一为 2。使用 git show HEAD 的原始实现和原始测试再次打包执行，同样得到 2 !== undefined。该行为无本轮改动；未修改 Midjourney 业务逻辑或放宽断言。不得宣称全部前端断言通过。

## Unverified Risks
- 真实 APIMart 生成、token 计费、生产实例、Docker 和部署未验证；无付费请求。
- 套图完整生产流程和 Arena 全部组合未穷举；验证范围是本次 profile、保存恢复和请求字段。

## Recommendation
- 本次模型设置可交付；既有 Midjourney 断言问题另行处理。
- 未提交、未推送；保留既有提交与临时文件。
