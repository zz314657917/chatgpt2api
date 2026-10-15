### BLOCKED: task-037-game-promo-qa

本地独立 QA：PASS。真实上游 AI 文案/付费生图：BLOCKED。以下所有浏览器任务响应和图片均为明确标注的 fixtures；浏览器交互、Canvas 像素、ZIP 下载解析、构建和纯断言是真实执行结果，不能据此声明真实模型质量或上游 API 已通过。

## Findings

最终源码未发现本轮已执行用例中的明确生产问题。主控审查提出的 Cookie-only 认证项目无法加载，以及轮询 success 先到/较慢 POST queued 回包后到的状态倒退，Developer 已修复，本轮均实际回归通过。

QA harness 的中间失败均已纠正并重跑：双层 main 需要精确定位；移动 Dialog 关闭需等待退出动画；主视觉映射五个槽位而非六个；前一竞态用例确认文案后按钮变为“文案已确认”。这些属于测试定位/前置状态错误，最终 21 项没有失败，产品断言没有删除或降低。

## Executed Checks

验收源码：`E:/codex-worktrees/chatgpt2api/task-037-game-promo`；Git HEAD `fe4953f86fbf9f4746dbfacbc422aed2131a9f93` 加未提交任务改动。源码清单记录每个文件 SHA-256，聚合 SHA-256 为 `f4bf3925cd16fa9b61541080900ef530449b7b501700c5bd7446da0716994355`。最终浏览器结束后重新核对：清单全部文件零变更。清单包括新增业务目录及导航/ecommerce 文件；未改动的 mobile-nav-provider 也纳入核对。

实际命令：

| 工作目录 | 命令 | 结果 |
| --- | --- | --- |
| Developer `web` | `npm.cmd run build` | PASS；TypeScript、Vite、65 个资产压缩完成 |
| Developer `web` | `npm.cmd run lint` | PASS；0 errors，既有 beads `workspace-canvas.tsx` 两条 exhaustive-deps warnings |
| Developer `web` | `node src/lib/game-promo/run-assertions.mjs` | PASS；映射、裁剪、draft parser、生命周期、模型参数、ZIP16，含终态保护断言 |
| Developer `web` | `git diff --check` | PASS；ecommerce 仅 LF/CRLF informational warning |
| F 主仓库 | `node docs/workflow/evidence/task-037-game-promo/browser-smoke.cjs` | PASS：15 项实际 Chromium 检查 |
| F 主仓库 | `node docs/workflow/evidence/task-037-game-promo/browser-edge-cases.cjs` | PASS：6 项实际 Chromium 边界检查 |
| F 主仓库 | `node --check docs/workflow/evidence/task-037-game-promo/browser-smoke.cjs` / `browser-harness.cjs` / `browser-edge-cases.cjs` | PASS |

浏览器使用现有 `C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright` 和 `C:/Program Files/Google/Chrome/Application/chrome.exe`，隔离 context，源代码 Vite 随机端口；无依赖安装、实付调用、生产账号、提交或部署。

### 主流程 15 项

1. `/image` 权限继承可访问；九个设计卡、十六个缺失槽位；未确认文案/主图按钮门禁。
2. 实际上传两张 PNG，编辑 scene/Logo 用途；素材库先取 detail，再 authenticated fetch `/images/qa-original.png`，没有把缩略图当原图。
3. 文案按钮 double-click 仅一个 POST；结构化 JSON 回填并手动编辑、确认；hero 门禁生效。
4. hero running 时刷新，继续轮询同一持久化 ID，未重复 POST；hero success 后仍需要显式批准；随后准确八个设计任务。九个 image 请求均 `n=1`，横幅未提交非法 `1082x300`。
5. 十六个槽位分别真实指针拖动、zoom=1.5、像素内容变化；切换真实像素后显示宽度等于目标宽度；每个下载 PNG 与当时预览 Canvas `toDataURL` 字节完全相同。
6. PNG ZIP 实际下载并解析十六个唯一文件名，PNG IHDR 尺寸逐个匹配 contract。
7. JPEG ZIP 实际下载并解析十六个唯一文件名，JPEG SOF 尺寸逐个匹配 contract。
8. 1440/768/390 宽度成功状态截图；没有 body 水平溢出；移动功能列表实际打开并验证“游戏推广”入口。
9. 上传主图替换保留历史版本、清除批准；切回旧版本仍需重新批准；编辑文案清除确认。
10. 修正要求后 regeneration；复制项目清除活动身份并显示取消；晚完成只更新原项目，副本不承接结果，无额外 POST。
11. Invalid JSON draft、服务端 error、text-only 图片 success、取消任务均可见且不能误批准主图；缺失槽位明确。
12. 再次检查桌面/平板/手机空/失败状态布局。
13. 新 subject 仅看到自己的一个空项目，旧项目事实/文案不泄露。
14. 不具 `/image` 权限的 subject 访问 `/game-promo` 自动转到 `/profile`。
15. 主流程 browser console error 和 pageerror 均零。

### 边界 6 项

1. Cookie-only `/auth/session` 无 token 字段、前端 localStorage/sessionStorage 均没有 auth session；合法账号能创建本地项目、刷新恢复同一 ID/输入。
2. 接受十五张参考；追加第十六张显示“超过参考图上限”，原十五张仍在，没有静默截断。
3. Mock 服务端收到 POST 并存储任务后主动 connectionreset；刷新后轮询原 client ID，成功回填，仅一次 POST。
4. POST 响应延迟 6500ms 并晚返回 queued；轮询先 success；等待晚响应后持久化状态仍 success、没有 error、文案未二次应用/误判过期，确认后 hero 可生成。
5. 只有成功 hero 时 ZIP 按钮显示 `5/16`、显式缺失横幅等；下载 ZIP 真实解析五个 hero 槽位：好友动态、通用界面、首页-排行榜、详情页-轮播图、咨询首页-推荐游戏。
6. Cookie-only subject A/B 切换隔离，回 A 恢复原项目；边界套件 pageerror 零。

纯断言与静态审阅确认七种尺寸：160×90、1082×300、96×54、140×160、140×180、400×225、240×135；九个设计和十六个槽位。差异范围审阅：既有 tracked 改动只涉及 route、shell、nav 与 ecommerce ZIP helper 提取；新业务文件位于批准路径。QA 未修改生产源码。

## Artifacts

持久证据目录：`docs/workflow/evidence/task-037-game-promo/`：

- `browser-harness.cjs`、`browser-smoke.cjs`、`browser-edge-cases.cjs`、`qa-inventory.md`
- `source-manifest.json`：精确源码文件/哈希。
- `browser-results.json`、`edge-results.json`：最终 15+6 项 PASS 明细，fixtures-only。
- `completed-viewport-1440.png`：有图、有发布预览、完整 `16/16` 的成功桌面状态。
- `completed-designs-desktop.png`：滚动到成功设计卡、参考图、版本和发布预览。
- `completed-viewport-768.png`、`completed-viewport-390.png`、`mobile-navigation.png`。

完整本地 scratch：`F:/java/chatgpt2api/.codex-build/task-037-game-promo-qa/`。包含完整两份 ZIP、32 个解包图片、16 个逐槽 parity PNG、mock-requests、Vite log、最终结果和截图。PNG ZIP 42086 bytes；JPEG ZIP 74051 bytes。浏览器/任务 Vite 均在 finally 关闭，最终进程检查没有该工作树 Vite 残留。

## Unverified Risks

- 真实 AI 文案、生图、输出中文可读性、九图视觉一致性、实际模型费用/质量和真实 authenticated 后端任务：BLOCKED；没有可用已授权 live test service，未调用实付上游。生成图片是合成测试 PNG，不能展示为真实 AI 成果。
- 项目删除按钮、浏览器 quota 故障注入、极大图片/大量历史存储和真实网络跨账号长请求未做完整浏览器压力验收；账户/任务恢复已经通过可控 fixture。不是已发现的产品缺陷。
- 其他模型 profile 的纯断言通过；浏览器任务请求主要覆盖 `gpt-image-2`，没有把所有模型实付执行一遍。
- QA 源码来自 E worktree。复制回主工作树后的 build/lint/assert 和部署/运行态仍由主控完成，本 QA 未复制或部署源码。
- 既有 Vite vendor-three 大块、npm `enable-pre-post-scripts` warnings、beads 两条 lint warnings 保留。

## Recommendation

本地 UI、生命周期和精确导出可继续交付/集成；先用 source-manifest 核对主控复制的文件，再在主工作树执行必要检查。真实上游验收仍单独 BLOCKED，不能把 fixture 的 21 项 PASS 表述为真实 AI 生图已通过。
