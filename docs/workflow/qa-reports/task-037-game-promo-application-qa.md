### PASS: task-037-game-promo-application-qa

## Findings

最终源码冻结后，独立 Chromium + 本地明确 mock transport 验收通过。主浏览器轮 15/15 项通过，补充轮 3/3 项通过；未发现业务阻塞缺陷。

覆盖结果：

- 旧项目无 `application` 数据可正常加载；原 9 个设计、16 个发布槽位保持可用。
- 3+1 申请事实输入、缺失事实保留“未提供”、完整多行 prompt、四项复制和实际 TXT 下载通过。
- 独立申请文案历史、prompt snapshot、raw malformed response、result fingerprint、可编辑草稿、迟到结果保护和历史恢复通过。
- 英文标题被阻止提交；banner prompt 包含简体中文、移除英文 Logo/水印、可信事实、安全区和 1082×300 约束。
- 原始参考图通过 authenticated read；multipart 文件实际字节数和 SHA-256 已记录。
- 人工“已检查图片无英文，主体和文字完整”绑定 selected version/source/crop；PNG/JPEG 实际下载均解析为 1082×300，实际字节小于 10,000,000。
- crop、历史版本和上传替换会使人工确认失效；PNG/JPG/JPEG 上传替换、完成版本 clone 保留内容且清除活动权威通过。
- 10,000,000 字节边界接受、10,000,001 字节实际 Blob guard 拒绝通过。
- malformed response 可见；输入修改后的迟到结果仅保存历史，不覆盖当前编辑；提交快照对缺失事实保持“未提供”。
- 双标签/双击只产生一个 POST；刷新和 uncertain response 只查询已有任务 ID，不重发。
- account switch、删除、unmount、提交前输入变更和原始参考图延迟读取 guard 通过。
- application 与 original batch 互斥；clone 清理 application active task IDs、confirmation 和 inspection authority。
- 390px/1440px 截图通过；无横向溢出和 document blank scrolling；原始 full ZIP16 实际下载仍为 16 项，尺寸与命名映射保持不变。

首轮测试脚本曾因未触发 range input 的 blur/提交事件导致 crop 检查超时，属于 QA harness 缺陷；已在证据脚本中补充 `press("Tab")` 后完整重跑通过。

## Executed checks

实际执行：

```powershell
D:/nobe/node.exe docs/workflow/evidence/task-037-game-promo-application/browser-application.cjs

cd web
D:/nobe/npm.cmd run build
D:/nobe/npm.cmd run lint

D:/nobe/node.exe --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' }); try { const a = await server.ssrLoadModule('/src/lib/game-promo/application.test.ts'); const b = await server.ssrLoadModule('/src/lib/game-promo/batch.test.ts'); console.log(JSON.stringify({application:a.runPromoApplicationAssertions(),batch:b.runPromoBatchAssertions()})); } finally { await server.close(); }"
```

结果：

- Browser main: 15/15 PASS.
- Browser supplement: 3/3 PASS.
- `npm run build`: exit 0.
- `npm run lint`: exit 0；仅保留既有 2 条 exhaustive-deps warning，无 error。
- focused assertions: application 26 checks，batch 31 checks，exit 0。

## Evidence

- [browser-results.json](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/browser-results.json)
- [supplement-results.json](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/supplement-results.json)
- [browser-application.cjs](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/browser-application.cjs)
- [multipart.cjs](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/multipart.cjs)
- [application-390.png](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/application-390.png)
- [application-1440.png](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/application-1440.png)
- [banner-export-inspection.png](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/banner-export-inspection.png)
- [oversize-real-blob-guard.png](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/oversize-real-blob-guard.png)
- [original-full-16.zip](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/original-full-16.zip)
- [build.log](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/build.log)
- [lint.log](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/lint.log)
- [focused-assertions.log](/F:/java/chatgpt2api/docs/workflow/evidence/task-037-game-promo-application/focused-assertions.log)

Source SHA-256 manifest is recorded in both result JSON files. The final source hashes matched before/after browser execution; 14 protected baseline paths also matched.

## Limits

Transport was an explicit local mock. No paid/live AI request was made, so actual model factual grounding, Chinese text legibility, absence of English pixels, visual quality and upstream service behavior remain unverified. No platform submission, deployment, commit or push was performed. Existing 5173/18737 processes and user browser profiles were preserved.
