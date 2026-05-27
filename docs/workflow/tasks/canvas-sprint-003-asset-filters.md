---
task_id: canvas-sprint-003-asset-filters
role: developer-worker
status: implemented
qa_mode: build
last_verified: 2026-05-27
---

# Canvas Sprint 003 Asset Filters

## 范围
- 新增 `/canvas` 资产栏过滤状态纯 TypeScript 模块：`web/src/app/canvas/canvas-asset-filters.ts`。
- 模块仅封装本地状态、过滤和排序逻辑，不接 UI、不修改 controller/page/canvas-node 等共享画布文件。
- 支持 `query`、`visibility(private/public/all)`、`orientation(all/square/portrait/landscape)`、`sort(newest/oldest/name)`。
- 不新增依赖，不新增后端接口，不改变 `ManagedImage` 数据结构。

## 核心 API
- `SmartCanvasAssetFilterState`：资产栏过滤状态。
- `DEFAULT_SMART_CANVAS_ASSET_FILTERS`：默认状态。
- `filterSmartCanvasAssets(assets, filters)`：返回过滤并排序后的新数组，不原地修改输入。
- `updateSmartCanvasAssetFilters(current, patch)`：合并并归一化局部状态更新。
- `resetSmartCanvasAssetFilters(patch?)`：重置为默认状态，可带少量覆盖字段。
- `getSmartCanvasAssetOrientation(asset)`：根据 `width/height` 推断方向，缺尺寸时读取 `orientation` 字段。

## 集成点
- `/canvas` 资产栏 UI 后续可在 controller 或局部 side panel 中持有 `SmartCanvasAssetFilterState`。
- 渲染图片库前调用 `filterSmartCanvasAssets(assets, assetFilters)`。
- 搜索框、可见性分段、方向分段和排序菜单分别调用 `updateSmartCanvasAssetFilters` 更新状态。
- 清空按钮可调用 `resetSmartCanvasAssetFilters()`。

## 验收命令
- `cd web && npm.cmd run build`

## 未集成风险
- 当前模块未接入 UI，真实交互、空状态文案和控件可用性仍需后续集成验证。
- 未新增单元测试；本次通过 TypeScript/Vite build 覆盖类型和打包检查。
- 方向过滤依赖图片尺寸或 `orientation` 字段；缺少这两类元数据的图片不会命中具体方向筛选。
