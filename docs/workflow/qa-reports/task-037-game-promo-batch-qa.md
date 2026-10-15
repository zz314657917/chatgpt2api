### PASS: task-037-game-promo-batch-qa

2026-10-15，独立 QA，approved contract 与最终源码 manifest 对齐。真实隔离 Chromium、项目 IndexedDB/localforage、native Web Locks、界面控件、任务轮询及下载均实际执行；仅 creation/image/API 运输使用 mock。26 组最终检查 PASS。

## Findings

未发现本增量的明确业务缺陷。源码与配置未修改。

保留三次测试工具诊断，均定位并仅修正 QA 脚本：

- 旧 harness multipart 正则把 `body.prompt` 截成第一行，修正要求断言误报。实际请求 raw 含完整中文要求，随后按 boundary 解析完整 fields/files 复核成功。保留 `browser-results-parser-failure.json`、`browser-run-parser-failure.log`。
- 已填内容的 wrapper label/textarea 使用 `getByLabel(..., exact:true)` 超时，页面与业务状态正常。事实/活动改为对应非精确 accessible label，续跑成功。保留 `browser-results-pre-resume.json`、`browser-run-pre-resume.log`。
- `about:blank` opaque origin 使 harness 的 sessionStorage 初始化抛出 Access denied。改为同源 `/qa-blank` 返回无应用脚本的 HTML 后，离页和异常汇总通过；没有泛化过滤 application pageerror。保留 `resumed-results.json`、`resumed-run.log`。

唯一预期运输 console error 是主动丢失 POST 响应产生的 `ERR_CONNECTION_RESET`；最终保留场景无 application pageerror、无未知 API。

## Executed Checks

证据根目录：`docs/workflow/evidence/task-037-game-promo-batch/`。

| 场景 | 实测 generation POST / 结果 |
| --- | --- |
| 文案未确认、模型不可用、已有活动个别任务 | 0；入口禁用，不与已有任务重叠 |
| 9 张已完成后补缺失 | 0；无新 batch，显示没有缺失设计 |
| 仅首页横幅/轮播图4缺失 | 2；仅此二目标，已有主图与其他历史不变 |
| 已有成功但未确认主图 | 确认前 0，确认后 8；主图不替换 |
| 缺失主图 | 确认前 1，确认后 9；其余 8 自动提交 |
| 已有完整历史后整套重生成 | 1 + 8；新主图 gate，旧主图不能确认本批，9 个设计均追加历史 |
| double click + 双标签同账号/项目 + 延迟响应刷新 | 刷新和确认前始终 1，最终 9 个唯一 task ID；单一 batch/hero version，已有 ID 查询恢复 |
| 丢失 POST 响应后刷新 | 确认前始终 1；持久 ID 查询，无自动重发，最终 9 |
| error/cancelled 主图 | 各 1；8 个依赖不提交，旧历史仍在 |
| 一个依赖失败 | 9；另外 7 个继续，最终 8/9，失败旧版本可选择 |
| 停止持有主图 + 复制 | 1；原 batch stopped，副本无 batches/活动 task IDs，无自动续跑 |
| 事实/活动/文案/图片模型/文案模型/参考用途/设置变更 | 各 1；后续 stopped，batch.inputs 保留启动时内容 |
| 参考图加载中停止 | 0；任务/version 已预持久关联，dispatch 被阻止 |
| 首个依赖 POST 响应延迟期间停止 | 2；其余 7 未提交 |
| 首个依赖 POST 响应延迟期间离页 | 2；其余 7 未提交 |
| 账号切换/删除运行项目 | 各 1；新账号/替代项目无旧 batch/version 污染 |
| 390/1440 宽度 | shared requirement、两个入口和状态可见，无横向溢出 |
| 下方发布区与 ZIP | 16 个 cards；真实下载 ZIP 逐条检查 16 个精确文件名、PNG 格式及尺寸 |

完整运输全文复核：9 个请求均含“所有9张使用同一条统一要求：海岛蓝绿与大标题”、原事实/活动/文案、`gpt-image-2`。新 hero 的请求含 1 个 `original-island.png`；8 个 dependents 按顺序含 2 个文件 `已确认主图`、`original-island.png`，且网络读取新 hero ID 对应 `/images/qa-<newHeroID>.png`。已捕获 batch correction、inputs、targets、heroVersionID、versionIDs、task IDs、poll 列表、历史和 progress。

模型/文案模型/设置变更通过浏览器内真实 store mutation 触发；事实、活动、文案及参考用途使用可见 UI。原资料与任务并未 mock。离页使用同源完整页面导航；没有单独验收 SPA route cleanup。

执行命令（目录 `F:/java/chatgpt2api`）：

```powershell
D:/nobe/node.exe docs/workflow/evidence/task-037-game-promo-batch/browser-batch.cjs
# 首轮 parser 诊断 exit 1；修正后保留 13 组成功及 selector 诊断 exit 1。

$env:QA_CHECK_FILTER='Captured |Stop during delayed|Unmount during|Account switch|Deleting running|Source manifest'
$env:QA_RESULT_PREFIX='resumed'
D:/nobe/node.exe docs/workflow/evidence/task-037-game-promo-batch/browser-batch.cjs
# 12 组行为成功；opaque-origin harness 异常汇总 exit 1。

$env:QA_CHECK_FILTER='Unmount during|Source manifest'
$env:QA_RESULT_PREFIX='finalguard'
D:/nobe/node.exe docs/workflow/evidence/task-037-game-promo-batch/browser-batch.cjs
# 同源离页与最终 manifest/异常检查，exit 0。

D:/nobe/node.exe docs/workflow/evidence/task-037-game-promo-batch/merge-results.cjs
# 同名场景使用最后成功证据；重新校验每组结果、source SHA、pageerror/API inventory，26 PASS，exit 0。
```

另用 Node 针对最终 `parsedMultipart` 断言完整多行 prompt 与全部 9 个文件列表，exit 0。未重复主控已经执行的 build/lint/31 纯断言。

合并结果与源码 manifest：

- `browser-results.json`：26 个 PASS checks、26 个最终场景、完整 fields/files、POST/poll/图片读取与诊断归因。
- `source-manifest.json`：6 个源码 SHA；各 run 前后相同，11 个 protected-baseline hash 实测不变。
- `summary.log`：每场景 POST/poll 计数。
- `batch-390.png`、`batch-1440.png`：批量面板含两个入口、共享要求、9/9 状态；已打开图片检查。
- `missing-awaiting-hero.png`、`dependent-failure-history.png`：门禁/失败历史截图。
- `batch-16-slots.zip`：2345982 bytes，SHA-256 `ED2A981FCCA33FF88C9DD3E193B81A87281D61D27F6B430021767C00A0AA8973`。

源码 SHA-256：

| Source | Hash |
| --- | --- |
| `web/src/app/game-promo/page.tsx` | `44B12428CE857C6C8037BC32260AB51C20A8C7D94A81569E7DC099AECFE7BBA2` |
| `web/src/lib/game-promo/tasks.ts` | `DD979E3D9EE177D6A9914B47A22DF9D6AFF22C934613CD75D52CEE91DA8D7A03` |
| `web/src/lib/game-promo/core.ts` | `D0728B4E2EAD741D2AF930F0A631A68116E7F04F323A28FB3A161B8F59443667` |
| `web/src/store/game-promo-projects.ts` | `4338013AE73ABF3FC660B37E0E4F34CDA12417B1A5E6FB9C5AE5C8A7440BB044` |
| `web/src/lib/game-promo/batch.ts` | `046BA347876EEDAF6DDBB57E1F99C06CB1CE9090614423F99F9CCD61364882C3` |
| `web/src/lib/game-promo/batch.test.ts` | `AF44C6917D941FC6C6AAA838551865DD0F0B07D841A2EF786FFCB68A20CE6E46` |

精确 scope：QA 仅写允许 evidence 与本报告，未改任何业务 source/config/dependency/knowledge/memory。Chromium contexts 均隔离，任务随机端口 Vite（58160/59776/60261）均由 finally 关闭，未操作 5173/18737 或用户 profile。

## Unverified Risks

没有真实付费 AI/image/chat 调用。本结论不等于真实模型生成质量、中文排版或 live backend/service 验收。120 秒服务端 missing-task 超时未在浏览器等待；纯断言与实现规则由主控验证。运行浏览器要求当前 native Web Locks；未验证其他浏览器。SPA 内部 route cleanup 未独立测试。

## Recommendation

当前批准的批量编排与浏览器 mock 验收通过，可交付该增量；真实 AI 成品质量仍需用户后续确认。
