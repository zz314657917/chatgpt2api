# Current Task

更新时间：2026-05-26 03:05 +08:00

## 背景

`/canvas` 已从 React Flow 试验版改为 React 自研画布。当前阶段不接 ComfyUI、不需要 GPU，仍复用 `chatgpt2api` 现有图片库、`creation-tasks`、权限体系和 Sub2API 模型路由。`F:/java/Infinite-Canvas-main` 只作为交互参考，不复制代码。

## 当前目标

把 `/canvas` 调整为 Infinite-Canvas 风格的节点式图片创作画布：

- 保留全局顶部导航，用户仍可在“创作台 / 无限画布 / 图片库”等入口之间切换。
- 左侧为功能导航，顶部为节点创建工具条。
- 图片、Prompt、API生成、Output 都是画布节点。
- 节点参数直接在节点内编辑，不再依赖右侧参数面板。
- 连线表达图片/Prompt -> API生成 -> Output 的轻量关系。
- 生成仍直接复用现有 `creation-tasks/image-generations` 和 `creation-tasks/image-edits`，不走 ComfyUI。

## 本次已完成

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

## 已确认事实

- 节点数据仍不保存 API key、base_url、group_id。
- 图片本体仍由现有图片库和对象存储管理，画布只保存引用。
- 当前没有引入 Infinite-Canvas 代码，也没有引入 ComfyUI 运行时。
- 当前参数仍以内联节点编辑为主；右侧只保留图片库、画布列表和运行记录浮层。

## 验证记录

- `cd web && npm.cmd run build`
- `cd web && npm.cmd run lint`
- `go test ./...`
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

## 待验证点

- 需要用户在真实 Chrome 里手测：
  - 从端口拖拽连线。
  - 文生图和图生图真实任务提交、轮询、Output 回填。
  - 本地图片拖入/粘贴后自动创建图片节点并可连到 API生成节点。
  - 自动保存 5 秒防抖是否符合预期。

## 后续可补

- 可开关资产库浮层，参考 Infinite-Canvas 的资产库。
- 节点复制/粘贴、撤销/重做。
- 更完整的图片编辑：裁剪、遮罩、宫格切分。
- 运行日志浮层、错误详情和任务取消。
- ComfyUI / RunningHub / 视频生成按钮暂时只是占位，后续需要单独设计。
