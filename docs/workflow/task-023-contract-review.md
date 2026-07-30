### PASS: task-023-image-manager-bulk-download-action

- 现有 `downloadItems("selected", selectedItems)` 已按当前个人、团队与公共 scope 取得受鉴权下载 URL；问题只在于多选后的入口被隐藏在“操作”弹层中。
- 将显式按钮限制为 `selectedCount >= 2` 可满足批量下载发现性，同时不干扰单图详情下载或一张图片的既有操作。
- 合同只允许修改素材库页面与 workflow 产物；未引入 ZIP、后端导出、下载签名或权限语义变更。
- browser QA 会覆盖多选显示、请求/下载调用、取消多选和 390px 布局；验收命令与仓库现有工具链一致。
