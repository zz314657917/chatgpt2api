### PASS: task-037-game-promo-gallery-qa

2026-10-15，独立 QA / 用户指定 `gpt-6.1-sol`。依据已批准的 gallery QA contract 及独立 PASS review，在主工作区源码启动独立随机端口 Vite，使用现有 Playwright Chromium 和隔离 browser context 验收。

## Findings

- 未发现本轮下方视觉区实现的明确业务问题。最终八组检查全部 PASS；修正测试焦点步骤后，两次全流程均通过。
- 首轮键盘测试 `ArrowRight` 已持久化 `zoom=1.01`，随后 `End` 等待最大值超时。测试脚本在 `End` 前显式重新定位并聚焦同一滑块，记录实际 focus/value 后重测；最终 `End` 得到 `4`。首轮证据保留，不能据其确定业务回归或确切焦点竞态根因；没有修改业务代码。
- 首轮记录：`docs/workflow/evidence/task-037-game-promo-gallery/browser-results-attempt-1.json`、`failure-4.png`。焦点诊断：`crop-keyboard-diagnostic.json`；第一次全通过：`browser-results-attempt-2.json`；最终独立新 context 重跑：`browser-results.json`。

## Executed Checks

执行命令：

```powershell
D:/nobe/node.exe docs/workflow/evidence/task-037-game-promo-gallery/browser-gallery.cjs
```

- 源码 SHA-256 为 `F059E9446B43EA78DE3EE664741F19DAD85C2A4B4D3300A815E513F4EA8EAABE`，运行前后一致；14 个 protected baseline 文件全部匹配。本 QA 只写合同允许的 evidence 目录及本报告，无源码 diff。
- 独立语义 section 的 accessible name 为“十六个发布槽位”，是资料/文案/九设计卡片顶层 grid 的后继兄弟。两者左缘和宽度一致，gallery 在顶层 grid 末尾至少 20px 后开始；没有右侧槽位栏。
- 全部 16 张卡片保留，`break-inside: avoid`，每张 DOM 只有一个 fragment，所有卡片在 section 水平边界内；canvas 的实际 bitmap 尺寸与槽位一致，适应预览的 CSS 宽高比保持自然画幅。
- 四种响应式测量：

| 视口宽 | 侧栏 | 工作区宽 | computed columns | document 横溢出 | 额外12次滚轮后 document 高/scrollY |
| --- | --- | ---: | ---: | --- | --- |
| 390 | 手机隐藏 | 351 | 1 | 无 | 950 / 0 |
| 768 | 手机隐藏 | 713 | 2 | 无 | 950 / 0 |
| 1440 | 展开 | 1101 | 3 | 无 | 1000 / 0 |
| 1440 | 收起 | 1309 | 4 | 无 | 1000 / 0 |

- 每种布局工作区均滚至 gallery 底部，距离自身滚动终点不超过 2px；document/body 始终等于视口高，额外滚轮不能滚入空白。手机和桌面 gallery 截图已人工查看。
- 裁剪使用真实键盘和鼠标：`ArrowRight` 放大至 1.01、`End` 至 4；鼠标拖动改变 x/y 及 canvas 像素。刷新后 crop 值、滑块值及 canvas data URL 一致；“居中重置”恢复 `{x:0.5,y:0.5,zoom:1}`，再次刷新仍一致。
- 首页轮播槽位在 390/1440 下切换“真实像素”：canvas CSS/bitmap 宽均为 1082px，卡内滚动容器 clientWidth 分别 273/306px、scrollWidth 1082px、overflow-x auto；实际内部 scrollLeft 能改变，document 没有横溢出。切回“适应预览”正常。
- 单槽实际下载 PNG 和 JPEG 均是 1082×300，文件名为 `slot-3-首页-轮播图-1082x300.png/.jpg`，检查了真实文件签名及尺寸。
- 完整 PNG/JPEG ZIP 各包含 16 个文件；逐项解包检查精确名称、文件类型及全部槽位尺寸。ZIP 下载名为 `海岛视觉区QA-16张.zip`。
- 缺失 banner 与 portrait-long 的隔离 fixture 仍显示全部16卡片：13完成、3缺失；缺图卡片为首页轮播 1082:300、新品推荐及详情页同类游戏 140:180，并标明缺失设计。实际部分 ZIP 名为 `海岛视觉区QA-13张.zip`，只包含13个完成槽位，名称/尺寸全部匹配。
- `generationPosts=0`、browser errors 0、unknown API 0；没有真实生成请求。

证据目录：`docs/workflow/evidence/task-037-game-promo-gallery/`。

主要截图：`gallery-1440-collapsed.png`、`gallery-1440-expanded.png`、`gallery-390-collapsed.png`、`gallery-768-collapsed.png`；四种布局均有对应 `gallery-bottom-*`；另有 `actual-pixels-390.png`、`actual-pixels-1440.png`、`gallery-partial-desktop.png`。

实际下载文件：`slot-3.png`、`slot-3.jpg`、`complete-16-png.zip`、`complete-16-jpeg.zip`、`partial-13-png.zip`。文件 SHA-256、字节数、逐项ZIP名称和尺寸详见最终 `browser-results.json`。

## Unverified Risks

图片来自用户本地 PNG fixture；九设计通过项目 store 注入隔离 browser context，相关 API 被 mock。没有真实 AI 文案/生图、中文海报效果、模型额度或计费验收；本次 PASS 不能外推为真实生成或生产部署通过。

没有重新测试无关的侧栏 CRUD，没有安装依赖、委派、提交、推送或部署。仅关闭本任务自己的 browser/Vite handle，未操作已有5173/18737进程。本 QA 未重复开发者的 build/lint，构建证据由主控另行复核。

## Recommendation

下方16槽视觉区布局及相关裁剪/导出回归可通过本轮 QA 门禁；主控可据此做最终范围裁决。整体 Task-037 的真实上游生成验收仍单独待完成。
