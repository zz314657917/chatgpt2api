---
title: Canvas And Embedded Session
type: architecture
repo: chatgpt2api
last_verified: 2026-06-17
---

# `/canvas`、素材库与嵌入会话恢复专题

## 适用范围

- 继续做 `/canvas`、`/image`、素材库、Sub2API launch/redeem、独立用户版登录态桥接、生产回跳或团队共享额度联调。
- 需要快速判断“这是不是纯前端交互问题”还是“同时牵涉任务链路/会话恢复/模型路由”的时候。
- 需要判断 2026-06-12 之后新增的 asset library、`gpt-image-2` 任务结果序列化、`/canvas` 输出图动作栈、`ecommerce-suite` 工作台，或 2026-06-16 之后的 Pro Studio / Gemini 生产边界，和现有图片链路是什么关系的时候。

## 一句话心智

`chatgpt2api` 当前的 `/canvas` 不是独立 GPU 或 ComfyUI 系统，而是落叶创艺独立用户版中的前端工作台；它继续复用现有图片库、`creation-tasks`、权限体系和 Sub2API 模型路由，而 embedded session 恢复、素材库过滤、钱包扣费语义、视频节点绑定约束、输出图动作栈和图片参数共享配置共同组成这条产品链路的默认可用性要求。

## `/canvas` 的默认定位

- `/canvas` 是站内已有图片能力上的节点式工作台，不是新后端。
- `/canvas` 现在服务于独立用户版创作主链路，而不是孤立的技术演示页。
- 画布保存节点、引用、交互状态和运行关系，但不保存独立 API key、`base_url`、`group_id` 一类网关身份配置。
- 图片本体、异步任务、任务状态和对象存储能力继续复用既有 image / creation task 链路。
- API 生成节点、图片节点、结果节点和组节点都是对现有能力的前端编排，不是另起一套调度系统。
- 6 月初新增的视频生成节点仍属于这套前端编排；它不是新后端，只是在现有能力上增加了“受绑定约束的视频工作流”。
- 2026-06-12 的 `fix(canvas): stack output image actions` 说明 `/canvas` 输出图现在默认支持连续堆叠动作，而不是每次生成都覆盖成单一结果；后续排查“结果回填错乱”时，应先按动作栈语义理解。
- 2026-06-12 的 `fix(image): serialize gpt-image-2 creation task outputs` 说明 `gpt-image-2` 结果序列化已经成为画布、素材库和 `/image` 共用的稳定后端边界，而不是某个页面的局部格式修复。
- 2026-06-16 的生产模式推进说明：`/canvas` 也不再只是普通节点工作台；它已经和 Pro Studio official 能力、电商生产交付、ZIP/text asset/素材归档链路共用一套任务底座。

## embedded session 恢复为什么重要

- 近期稳定修复说明：嵌入模式下的 stale token / cookie 失配不是边角 bug，而是会直接影响用户是否还能继续使用 `/image` 或 `/canvas`。
- 对从 Sub2API 或其他上游入口跳转进来的用户来说，“能否恢复当前会话”比“是否能重新打开登录页”更关键。
- 对落叶创艺独立用户版来说，“会话恢复后还能否保住余额语义、充值入口和团队扣费上下文”也已经变成真实产品问题，而不是外围集成细节。
- 所以这类问题不能只按普通 auth page 处理，而要一起看 session、request、store、cookie 和 launch 入口。

## 当前稳定约束

### 1. `/canvas` 继续复用现有 creation tasks

- 运行节点、轮询状态、Output 回填和重新打开后恢复，依赖的是现有任务链路，不是新建的画布专属 worker。
- 如果任务状态、权限或模型目录出问题，`/canvas` 往往会直接受到影响。

### 2. `/canvas` 的“轻引用”是默认设计

- 图片列表、预览、详情读取和画布节点展示已朝“轻摘要 + 按需详情 + 图片轻引用”方向稳定下来。
- 这意味着后续优化性能时，不应回退到全量原图/全量详情一次性灌进前端的旧思路。
- 2026-06-11 到 2026-06-12 的 asset library smoke 进一步证明：`/image-manager`、`/image`、`/canvas` 共享的是同一套素材筛选、归类、未归类和轻引用链路，不能把 `canvas` 侧边栏当成孤立实现。

### 3. embedded / Sub2API 登录链路是工作区能力的一部分

- launch/redeem、leaf network login、嵌入式登录态恢复，已经进入产品默认范围。
- 后续修改 `/image`、`/canvas` 或登录承接时，不能假设用户都从本地登录页冷启动进入。

### 4. 独立用户版的钱包和团队语义已经压到创作链路里

- 顶部余额、充值入口、任务预扣/确认/退款和团队共享额度，不再只是外围运营功能。
- 对独立用户版来说，`/image` 或 `/canvas` 能不能正常创作，已经和用户是不是通过 Sub2API 进入、当前钱包摘要是否可见、当前团队 payer/actor 语义是否正确耦合在一起。

### 5. 组节点、轮询恢复和自动保存属于当前真实验证面

- `/canvas` 当前不是只需要“页面能打开”。
- 真正的最小验证面至少包括：节点运行、queued/running 状态恢复、Output 回填、组节点输入、自动保存和重新打开恢复。
- 2026-06-12 之后，这个验证面还应包括“Output 节点能连续显示多次输出动作”“素材库侧边栏可按全部 / 未归类 / 素材集筛选并把素材加入画布”“session-probe 不回退到根路径 iframe”。

### 6. 视频节点与参数共享配置属于新的稳定约束

- 视频节点不是对所有登录态无条件开放；当前默认规则是“没有 Sub2API 绑定时 fail-closed 隐藏视频模型”。
- `/image` 与 `/canvas` 现在共享一套更稳定的图片参数规则：
  - `auto` 只作为 UI 值，不作为 `image_resolution` 提交。
  - 像素图标尺寸作为显式 `size`，不叠加分辨率预设。
  - `1080p` 会归一为上游 `1k`。
  - `output_format/output_compression` 走统一规范，不再原样透传非法值。
- 因此后续修改 `/canvas`、`/image` 或 Sub2API 图片 payload 时，不能只盯单个页面；要把共享参数规则一起考虑。

### 7. 素材库和电商套图工作台都在复用现有创作底座

- 2026-06-12 新增的 `ecommerce-suite` 不是独立后端系统，也不是新的项目实体；它复用现有 `image-edits` / creation-task、登录态、权限和前端素材能力。
- 当前更合理的理解是：`/image`、`/canvas`、`/image-manager`、`/social`、`/ecommerce-suite` 正在共享同一套“独立用户版登录态 + 资产输入 + creation-task 输出”的产品底座。
- 因此后续如果某个工作台出现“素材能选但结果不能回填”或“登录态正常但下载/输出异常”，不要只在单页查；应把 creation-task 输出序列化、素材引用和会话恢复一起看。

### 8. Pro Studio / Gemini 已进入 `/canvas` 默认验证面

- `/canvas` 生产模式已经是稳定默认能力，而不是临时实验入口。
- official 设置、`gpt-image-2-official` 锁模、SKU 批量预览、ZIP 交付和项目素材集归档，都建立在现有 creation-task / 输出序列化 / 素材库链路上。
- Gemini 图片模型当前按 preview 路由并支持 reference uploads；后续如果画布或工作台出现 Gemini 兼容问题，优先按 preview/reference 语义排查。
- 因此 `/canvas` 的最小验证不应再只覆盖节点拖拽和结果回填，还应确认生产模式和共享输出链路没有脱节。

## 常见误判

- 不要把 `/canvas` 误判成 ComfyUI、Infinite-Canvas 代码直搬或新 GPU 调度系统。
- 不要把 6 月 12 日新增的 `ecommerce-suite` 误判成独立业务后端；它目前仍是基于现有图片任务和本地历史的前端工作台。
- 不要把 Pro Studio 生产模式误判成只影响 `ecommerce-suite` 的参数壳层；它已经影响 `/canvas`、official route、素材归档和交付闭环。
- 不要把 Gemini 变更误判成模型文案调整；preview 路由与 reference upload 已经进入真实协议边界。
- 不要把 embedded session 恢复误判成纯 cookie 小修。
- 不要把独立用户版的余额/充值/团队空间问题误判成纯展示文案；它们和 launch/redeem、session、创作扣费是同一条产品链路。
- 不要把“视频节点隐藏”误判成纯 UI 细节；它是受绑定状态约束的产品边界。
- 不要把素材库 smoke 证据理解成“只验证了 image-manager”；最新浏览器证据已经覆盖 `/image` 参考图输入、`/canvas` 加入画布、团队 manager/member 权限和 public 只读边界。
- 不要只跑 `go test ./...` 就认为 `/canvas` 没问题；它还有明显的前端交互和浏览器回读面。
- 不要只跑前端 build 就认为登录态桥接、任务路由和模型目录没退化。

## 推荐补读路径

- 入口文档：
  - `knowledge/00-start-here.md`
  - `knowledge/05-current-focus.md`
  - `knowledge/03-build-and-verify.md`
- 当前快照：
  - `knowledge/tasks/current-task.md`
  - `knowledge/tasks/timeline.md`
- 关键代码：
  - `web/src/app/canvas/page.tsx`
  - `web/src/app/canvas/use-smart-canvas-controller.ts`
  - `web/src/app/canvas/canvas-node.tsx`
  - `web/src/app/image-manager/page.tsx`
  - `web/src/app/ecommerce-suite/page.tsx`
  - `web/src/lib/api.ts`
  - `internal/service/canvas.go`
  - `internal/service/image_task.go`
  - `internal/service/text_asset.go`
  - `internal/service/sub2api_launch.go`

## 最小验证面

### 改 `/canvas` 交互或节点逻辑

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `go test ./...`
4. `git diff --check`
5. 如本地预览可用，至少补一次 `/canvas` 浏览器回读，并确认视频节点显示/隐藏符合当前绑定状态
6. 如改动触达 Output、素材库或结果回填，再补一次“素材加入画布 -> 生成/显示输出 -> Output 节点保留动作栈”的最小浏览器回读
7. 如改动触达 production mode、official 设置或 Gemini reference，再补一次 `/canvas` 生产模式或相关工作台 smoke，确认 preview/reference 与素材归档链路未退化

### 改 launch / redeem / embedded session

1. `go test ./...`
2. `cd web && npm run build`
3. `git diff --check`
4. 至少补一次从登录态进入 `/image` 或 `/canvas` 的最小人工回读

### 改独立用户版 / 余额充值 / 团队空间桥接

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `go test ./...`
4. `git diff --check`
5. 至少补一次 `Sub2API 登录/回跳 -> 余额展示 -> 创作提交 -> 成功确认或失败退款 -> 团队空间最小记录` 的最小闭环回读

### 改图片列表 / 轻摘要 / 对象存储

1. `go test ./...`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. 验证列表轻摘要、详情按需读取、预览加载和必要时的历史恢复
5. 如涉及素材集筛选、加入参考图或加入画布，至少复用一次 `task-007-asset-library-smoke` 的浏览器脚本或等价人工回读

### 改图片参数共享配置或 composer 分辨率预设

1. `go test ./...`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. `git diff --check`
5. 至少补一次 `/image` 或 `/canvas` 的最小页面回读，确认 payload 不回退到旧字段组合

### 改 `gpt-image-2` 结果序列化、素材库工作流或 `ecommerce-suite`

1. `go test ./...`
2. `cd web && npm run lint`
3. `cd web && npm run build`
4. `git diff --check`
5. 如本地环境可用，至少补一次 `/image`、`/canvas` 或 `/ecommerce-suite` 的最小浏览器回读，并确认结果仍能进入素材/输出链路

## 2026-06-12 新增稳定事实

- 素材库 smoke 已有成体系证据，不再只是“命令通过”：`task-007-asset-library-smoke` 已验证 bridge 进入 `/image`、`/image-manager` 素材集与未归类筛选、团队 manager/member 权限、`/image` 参考图输入、`/canvas` 加入画布，以及 `session-probe` 没有根路径 iframe 回退。
- `/canvas` Output 默认按动作栈保留输出图，而不是用最新一次结果覆盖历史动作。
- `gpt-image-2` creation-task 输出序列化已经进入稳定后端边界；后续如果图片结果、素材入库或画布回填异常，要同时检查协议层和任务序列化，而不是只看前端展示。
- `ecommerce-suite` 已成为新的普通用户工作台入口之一，但它仍复用现有登录、权限、素材输入和图片任务能力；排障时不应把它和 `/image`、`/canvas` 切开看。
- `Pro Studio` 生产模式和电商生产交付已进入默认验证面：`/canvas` 与 `/ecommerce-suite` 都应能切换生产模式，SKU `8/12` 张预览保持 `4+4` / `4+4+4`，ZIP/text asset/项目素材集归档不脱离现有任务链路。
- Gemini 图片模型当前按 preview 路由并支持 reference uploads；后续兼容排查默认先看 preview/reference payload，而不是旧模型入口。
