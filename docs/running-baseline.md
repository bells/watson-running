# 跑步站点改版基线（2026-09-28）

本基线来自本地 Vite 预览的真实浏览器截图，数据为仓库已公开的静态资源。截图保存在 [`output/playwright/`](../output/playwright/)；浏览器中的地图请求可能受 token、瓦片服务和网络环境影响，因此截图仅证明页面在该环境中的表现。

| 页面 | 桌面深色 | 窄屏深色 | 浅色 | 失败状态 |
| --- | --- | --- | --- | --- |
| Classic 首页 | [截图](../output/playwright/baseline-classic-home-desktop.png) | [截图](../output/playwright/baseline-classic-home-mobile.png) | [截图](../output/playwright/baseline-classic-home-light.png) | 本地地图空白可见于桌面截图 |
| Classic `/summary` | [截图](../output/playwright/baseline-classic-summary-desktop.png) | [截图](../output/playwright/baseline-classic-summary-mobile.png) | [截图](../output/playwright/baseline-classic-summary-light.png) | 无数据状态待注入验证 |
| Classic `/activity/:id` | [截图](../output/playwright/baseline-classic-detail-desktop.png) | [截图](../output/playwright/baseline-classic-detail-mobile.png) | [截图](../output/playwright/baseline-classic-detail-light.png) | 明细失败待注入验证 |
| Dashboard | [截图](../output/playwright/baseline-dashboard-desktop.png) | [截图](../output/playwright/baseline-dashboard-mobile.png) | [截图](../output/playwright/baseline-dashboard-light.png) | [无 Mapbox token 时整页报错](../output/playwright/baseline-dashboard-no-token-error.png) |

## 已有交互与检查清单

- Classic 首页有年份选择、记录列表、地图定位、单次详情入口和主题切换。选中单次记录时使用 `#run_<id>`；换筛选会清除该选择。
- `/summary` 由 `ActivityList` 提供周期浏览；详情页已有公开的分段与曲线信息。改版需保留记录数值、单位、分段来源及返回上下文。
- Dashboard 有自己的热力图、地图、日志和轨迹视图，需保持根路径与子路径构建可用。
- 首页桌面首屏地图在本地测试环境中呈大片空白；控制按钮仍露出。窄屏首屏被巨大累计数字占据，年份与记录入口排在较后位置。
- Dashboard 没有有效 Mapbox token 时，地图异常上升到整页错误边界。地图失败应降级为局部状态，保留其他记录内容。
- 浅色 `/summary` 仍是密集的等宽卡片墙，页面顶部没有清楚说明当前周期范围；浅色详情则单独使用蓝色图形强调，与首页的跑步荧光黄不一致。
- Classic 列表当前窄屏以宽表格及横向滚动为主，详情入口需要更明显的触摸和键盘路径。
- 后续验收须补齐空筛选、无轨迹、地图失败、键盘、触摸和减少动态效果的浏览器证据；此处未把源码推断当成已运行验证。
