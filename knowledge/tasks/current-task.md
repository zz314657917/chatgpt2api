# Current Task

更新时间：2026-05-28 00:42 +08:00

## 背景

`/canvas` 已从 React Flow 试验版改为 React 自研画布。当前阶段不接 ComfyUI、不需要 GPU，仍复用 `chatgpt2api` 现有图片库、`creation-tasks`、权限体系和 Sub2API 模型路由。`F:/java/Infinite-Canvas-main` 只作为交互参考，不复制代码。

## 当前目标

把 `/canvas` 调整为 Infinite-Canvas 风格的节点式图片创作画布：

- 保留全局顶部导航，用户仍可在“创作台 / 无限画布 / 图片库”等入口之间切换。
- 左侧为可收缩画布列表，顶部和右键菜单为节点创建工具条。
- 图片、Prompt、LLM、API生成、Output 都是画布节点。
- 节点参数直接在节点内编辑，不再依赖右侧参数面板。
- 连线表达图片/Prompt -> API生成 -> Output 的轻量关系。
- 生成仍直接复用现有 `creation-tasks/image-generations` 和 `creation-tasks/image-edits`，不走 ComfyUI。

## 本次已完成

- 已把 `/canvas` 后续开发纳入 P/G/E 门禁：
  - `docs/workflow/status.md`
  - `docs/workflow/agent-matrix.md`
  - `docs/workflow/spec.md`
  - `docs/workflow/sprint-01-contract.md`
  - `docs/workflow/tasks/canvas-sprint-001.md`
  - `docs/workflow/sprint-01-review.md`
  - `docs/workflow/sprint-01-qa.md`
  - `docs/workflow/sprint-01-fix-log.md`
- `.gitignore` 已放开 `docs/workflow/**`，让 P/G/E 文档能进入版本控制。
- `AGENTS.md` 和 `knowledge/00-start-here.md` 已加入 P/G/E 受管入口片段。
- Sprint 1 已实现核心图片输入稳定性：
  - 图片引用去重优先识别图片库 `path`，兼容 `url/local_url/thumbnail_url`。
  - 右侧图片库“输入”、拖拽到 API生成节点、选中 API生成节点后粘贴图片，统一创建或复用上游图片节点并连线。
  - API生成节点展示输入图时使用同一套去重 key，避免上游连线和旧 `input_images` 导致重复缩略图。
  - 运行生成前会把遗留直接 `input_images` 迁移为上游图片节点，画布关系保持可见。
  - 预览仍允许使用缩略图；编辑、裁剪、生成和图生图提交继续通过 `canvasImageSource()` 读取原图引用。
- `/canvas` 前端改成节点式画布：
  - `web/src/app/canvas/page.tsx` 只负责页面壳和组件接线。
  - `web/src/app/canvas/use-smart-canvas-controller.ts` 承载保存、上传、运行、拖拽、粘贴、缩放、连线和节点状态。
  - `web/src/app/canvas/canvas-node.tsx` 承载左侧导航、顶部工具条、画布、连线、节点 UI、小地图。
  - `web/src/app/canvas/canvas-utils.ts` 承载智能画布数据转换、默认节点、连线和输出转换。
  - `web/src/app/canvas/types.ts` 承载节点、连线、视口和连接状态类型。
- 新增节点类型：
  - `image`
  - `prompt`
  - `image_generation`
  - `result`
- 新建画布会自动出现默认链路：
  - `Prompt -> API生成 -> Output`
- 已保存的空智能画布保持空白，不再每次加载都强行补默认节点。
- API生成节点内可编辑：
  - Prompt 补充文本
  - 模型
  - 尺寸比例
  - 可见性
  - 生成数量
  - 生成按钮
- 图片拖拽/粘贴/上传会创建图片节点；如果当前选中 API生成节点，会自动连到该节点。
- Prompt 节点内支持 `@图片` 引用当前画布和图片库图片。
- API生成节点运行时会读取上游 Prompt 和图片节点，有图片走图生图，无图片走文生图。
- Output 节点展示生成结果；如果没有 Output 下游，运行时自动创建并连线。
- `/canvas` 在 `AppShell` 中保持全宽工作区，但恢复全局 `TopNav`；画布主体仍不受 1440px 居中容器限制。
- 修复画布按钮点不动问题：
  - `SmartCanvasBoard` 显式使用 `h-full min-h-0`，避免绝对定位画布层在部分尺寸下命中区域异常。
  - 节点内部 Prompt、API生成、缩放等交互区域在 `pointerdown` 阶段阻止冒泡，避免被画布拖拽/连线事件吞掉。
- 修复自检发现的第一批可用性问题：
  - 自动保存改成版本号保护，保存请求返回时不会用旧画布覆盖后续新编辑。
  - 切换画布、新建画布、返回前会先 flush 保存；保存失败才弹确认。
  - 生成节点处于 queued/running 时会禁用再次提交，并在重新打开画布时恢复轮询。
  - API生成节点读取图片输入时统一包含自身输入、上游 Prompt 图片、上游图片节点、上游结果图片。
  - 运行时不再把“上游 Prompt + 节点 Prompt”的合并文本写回生成节点，避免重复叠加。
  - 右侧图片库浮层和运行记录浮层已重新挂载，桌面视口可见。
  - 侧栏暂未实现的黑夜模式/API 设置/工作流设置按钮改为禁用状态，避免误导为可点击功能。
- 修复第二批交互问题：
  - 节点头部增加明确拖拽手柄，拖动节点时不再依赖 React state 生效后的事件监听。
  - 拖拽会在 `pointerdown` 即时绑定窗口级 `pointermove/pointerup`，避免快速拖动丢事件。
  - 平移画布时同步 `viewportRef`，保存的视口不再落后。
  - 拖动端口连线时松手会按坐标检测目标输入端口，减少 pointer capture 导致的连接失败。
  - 新增节点会按已有节点数错位，减少连续点击“提示词/节点”后堆叠遮挡。
  - 选中节点提高层级，避免被历史重叠节点盖住。
  - 顶部上传按钮改为创建图片节点；拖图片到 API生成节点时会在其左侧创建图片节点并自动连线。
- 8081 Docker 容器已更新到最新嵌入前端资源。
- Sprint 2 已实现 Infinite Canvas 三工具迁移：
  - `/canvas` 左侧工具栏新增 `细节增强`、`图片编辑`、`角度控制`。
  - 三个工具只在当前选中节点包含单张可编辑图片时启用；未选中、无图或多图时置灰并给出 tooltip。
  - `细节增强` 使用默认高清修复/纹理增强 prompt，复用 `creation-tasks/image-edits`，输出为新 `result` 节点并连回来源节点。
  - `角度控制` 新增水平角、垂直角、缩放滑杆面板；第一阶段把参数转为 image edit prompt，并把 `tool_type`、`tool_parameters`、`source_images` 保存到结果节点。
  - `图片编辑` 复用现有 `SmartCanvasImageEditor`；应用后上传图片库，创建相邻图片节点，保存来源图片与工具参数，并连回来源节点。
  - 三工具产物可见性跟随来源节点，避免任务提交和节点数据不一致。
- 用户要求“起多个智能体开发不同的功能”后，已并行启动并关闭 3 个 sub-agent：
  - `web/src/app/canvas/canvas-history.ts`：撤销/重做历史纯 TS 模块，后续 Sprint 3 已接入 controller/UI。
  - `web/src/app/canvas/canvas-error-details.ts`：错误详情格式化纯 TS 模块，暂作为候选模块保留。
  - `web/src/app/canvas/canvas-asset-filters.ts`：图库筛选纯 TS 模块，暂作为候选模块保留。
- 本轮修复 Sub2API launch/redeem 进入失败：
  - Docker 容器内访问宿主或其他本地服务不能用 `127.0.0.1:8080` 指向宿主。
  - `.env` 中 `CHATGPT2API_SUB2API_REDEEM_URL` 和 `CHATGPT2API_SUB2API_GATEWAY_BASE_URL` 已改为 `host.docker.internal:8080`。
  - 8081 容器已热替换 Linux embed 二进制并恢复 healthy。
- 本轮调整图片编辑器布局：
  - 顶部保留 `裁剪 / 扩图 / 遮罩 / 画笔 / 宫格切分` 编辑模式切换。
  - 左侧只显示当前模式参数和子工具，避免把全局模式列表塞进参数栏。
  - `canvas-image-editor.tsx` 已拆出 `canvas-image-editor-config.ts`、`canvas-image-editor-types.ts`、`canvas-image-editor-utils.ts`、`canvas-image-editor-fields.tsx`、`canvas-image-editor-tool-panel.tsx`。
- 本轮继续图片多场景性能优化自检修复：
  - `/api/images` 列表接口不再同步执行 `CleanupStorage()`，避免图片列表请求触发全盘扫描/治理导致正式环境卡住。
  - `scope=public` 对管理员也只返回公开图片；管理员查看全部图片需显式使用 `scope=all`。
  - 列表 `preview_url` 改为轻量缩略图路由，详情/下载/同款生成再按需读取 `/api/images/detail`。
  - `/image-manager` 图片墙改为 `react-virtuoso` 虚拟网格，去掉滚动哨兵和本地全量 DOM 增长。
  - 图片库预览、复制公开图地址、下载、同款生成改为按需拉详情，首屏卡片只加载缩略/预览源。
  - `/canvas` 素材引用改为 `path + thumbnail/preview` 轻引用，拖入画布不再保存 `local_url` 原图；后端运行图生图时优先用 `path` 读取原图。

## 已确认事实

- 节点数据仍不保存 API key、base_url、group_id。
- 图片本体仍由现有图片库和对象存储管理，画布只保存引用。
- 当前没有引入 Infinite-Canvas 代码，也没有引入 ComfyUI 运行时。
- 当前参数仍以内联节点编辑为主；右侧只保留图片库素材、运行记录和最近操作浮层。
- `细节增强` 和 `角度控制` 第一阶段仍是 prompt 化 image edit，不是专用 upscale 或多角度模型。
- `细节增强` 和 `图片编辑` 当前主要是快捷入口，和节点内既有能力有重复；后续更适合下沉为节点内或右键动作，保留 `角度控制` 作为更独立的工具入口。
- Worker 产出的 `canvas-error-details.ts`、`canvas-asset-filters.ts` 只经过构建验证，当前还不是用户可见功能。
- Docker 容器内访问本机 8080 的 Sub2API 服务应使用 `host.docker.internal:8080`；`127.0.0.1:8080` 会指向 chatgpt2api 容器自身。
- 图片列表接口的热路径不能同步执行清理治理；清理保留在启动、生成后清理和显式治理接口中。
- 图片库列表项仍保留 `url` 兼容旧调用，但前端首屏渲染和画布素材引用不再依赖它加载原图。
- Sprint 3 已实现：
  - 左侧 `SmartCanvasLeftRail` 改为可收缩画布列表，支持切换、新建、刷新、重命名和二次确认删除，折叠状态写入 `localStorage`。
  - 顶部和右键菜单统一创建 `Prompt`、`LLM`、`API生成`、`Output`；右侧图片库移除画布列表，只保留素材选择。
  - 新增 `llm` 节点类型，复用 `creation-tasks/chat-completions` 输出文本，可连接到 API生成作为提示词输入。
  - API生成节点合并顺序为：上游 Prompt 文本 + 上游 LLM 输出文本 + 自身补充提示词。
  - `canvas-history.ts` 已接入 controller，提供顶部撤销/重做按钮、`Ctrl+Z` / `Ctrl+Y` 和右侧最近操作列表。

## 验证记录

- 本轮 P/G/E Sprint 1 验证：
  - `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
  - `cd web && npm.cmd run build`：PASS，仅 Vite chunk size warning。
  - `go test ./...`：PASS。
  - `git diff --check`：PASS，仅 Windows LF -> CRLF 工作区提示。
  - 已构建 Linux embed 二进制，热替换 8081 Docker 容器并重启，`/health` 返回 200。
  - Browser 打开 `http://127.0.0.1:8081/canvas` 被重定向到 `/login`，提示“授权信息无效”；本轮浏览器交互验收记录为受登录态限制。
  - 用户真实 Chrome 登录态验收：PASS，Sprint 1 核心链路测试没问题。
- `cd web && npm.cmd run build`
- `cd web && npm.cmd run lint`
- `go test ./...`
- Sprint 3 验证：
  - `cd web && npm.cmd run build`：PASS，仅 Vite chunk size warning。
  - `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
  - `go test ./...`：PASS。
- `git diff --check`
- 8081 Docker 容器已热替换当前 Linux embed 二进制并重启，健康检查返回 200。
- Playwright 浏览器登录后打开 `/canvas`，快照确认已渲染：
  - 全局顶部导航，包含“创作台 / 无限画布 / 图片库”
  - 左侧功能导航
  - 顶部节点工具条
  - Prompt 节点
  - API生成节点
  - Output 节点
  - 连线和小地图
- 右侧图片库和运行记录浮层在 1920x1080 视口可见。
- Playwright 点击验证：
  - 点击顶部“提示词”后新增 Prompt 节点，保存状态变为“未保存”。
  - Prompt 输入框可填入 `smoke prompt`，输入值保持。
  - 点击“放大”后缩放按钮可正常响应。
- Playwright 交互验证：
  - 空白画布拖拽平移后 world transform 变化。
  - 节点头部拖拽后节点 transform 变化。
  - 新增 Prompt 输入文本后，至少一个 `API生成` 按钮变为可用。
- Sprint 2 验证：
  - `cd web && npm.cmd run build`：PASS，仅 npm config warning 与 Vite chunk size warning。
  - `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
  - `go test ./...`：PASS。
  - `git diff --check`：PASS，仅 Windows LF -> CRLF 工作区提示。
  - 临时 smoke 后端曾启动于 `127.0.0.1:18080`，验证后已停止；由于登录页只暴露 leaf network 登录按钮，本轮未完成自动化点选级浏览器验收。
- 本轮登录链路与图片编辑器布局验证：
  - `cd web && npm.cmd run build`：PASS，仅 Vite chunk size warning。
  - `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
  - `git diff --check`：PASS，仅 Windows LF -> CRLF 工作区提示。
  - `http://127.0.0.1:8081/health` 返回 200。
  - 容器内访问 `http://host.docker.internal:8080/health` 返回 ok。
- 本轮图片多场景性能优化验证：
  - `go test ./internal/service ./internal/httpapi`：PASS。
  - `cd web && npm.cmd run lint`：PASS，0 warnings / 0 errors。
  - `cd web && npm.cmd run build`：PASS。
  - `git diff --check`：PASS，仅 Windows LF -> CRLF 工作区提示。
  - 已构建 Linux embed 二进制并热替换 8081 Docker 容器，容器 healthy。
  - `http://127.0.0.1:8081/image` 返回 200。
  - 8081 API 烟测：`/api/images?page_size=50&scope=mine` 返回分页结构；当前本地个人图库为空，`scope=all` 可见 14 张历史图片，`scope=public` 为 0，符合权限语义。
  - 浏览器插件受当前登录页只暴露落叶网络登录入口、插件页面脚本为只读等限制，未完成自动化点选级图片库验收；本轮已用构建、API 和容器健康检查覆盖。

## Sprint 2 验收结论

- Sprint 2 已关闭：Infinite Canvas 三工具迁移完成，命令验证通过。
- `docs/workflow/status.md` 已进入 `done`，下一步应先进入 Sprint 3 Planner，再起草新的 contract。
- 本轮未发现需要立即回滚或阻断发布的问题。

## 后续可补

- 可开关资产库浮层，参考 Infinite-Canvas 的资产库。
- 收敛 `细节增强`、`图片编辑`、`角度控制` 的入口层级：重复快捷功能优先下沉到节点内或右键菜单，专用模型接入后再提升入口。
- 节点复制/粘贴；撤销/重做已具备当前浏览器会话内存历史，后续可评估服务端版本历史。
- 运行日志浮层、错误详情和任务取消；已有 `canvas-error-details.ts` 候选模块。
- 图片库筛选；已有 `canvas-asset-filters.ts` 候选模块。
- 专用模型适配：`fal-ai/recraft/upscale/crisp` 风格细节增强、多角度图像编辑参数化后端。
- ComfyUI / RunningHub / 视频生成按钮暂时只是占位，后续需要单独设计。
