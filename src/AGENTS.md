# 前端协作指南

适用于 `src/` 及所有子目录，补充[根级指南](../AGENTS.md)。命令均在仓库根目录执行。

## 修改入口与边界

- 主题注册入口是 `App.tsx`，通过 `lazy` 与 `Suspense` 加载 Classic 或 Dashboard，未知配置回退到 Dashboard。保留外层语言 Provider、错误边界和加载反馈。
- 跨主题配置、类型、i18n、数据与通用 Hook 放在 `core/`。`config.ts`、`types.ts`、`hooks/` 中的兼容导出应继续指向共享实现。
- Classic 的入口、路由、地图和筛选逻辑位于 `themes/classic/`；Dashboard 入口位于 `themes/dashboard/`，其主要展示组件在 `components/`。修改共享组件前检查实际调用方。
- 新增主题先读 [主题文档](../docs/theme-system.md)，不要将 Classic 的多页路由或全局样式直接引入其他主题。
- `bells/run-agent` 是对应后端。接入时先核对后端实际接口，再定义 TypeScript 请求、响应和 SSE 事件；前端负责加载、取消、重连与错误反馈，服务端凭据和业务逻辑留在后端。当前活动 JSON 加载不等于已完成后端接入。
- 通用功能优先复用已有依赖；新增第三方库时核实维护状态、React 19 兼容性和体积。复杂计算放入纯函数或 Hook，新代码不用 `any`。

## 数据与隐私

- `core/hooks/useActivities.ts` 和 Classic 同名 Hook 加载 `static/activities.json?url`。这是同站点的静态构建资源；保留 Suspense 缓存、错误处理与重试行为，数据更新需要重新构建。
- 字段变更必须检查 `core/types.ts`、`themes/classic/utils/utils.ts`、Python `Activity`、`ACTIVITY_KEYS`、序列化及 TUI 消费者，不要只修改 TypeScript 类型断言。
- `static/activities.json` 是生成资产，不可作为 UI 修复的手工编辑入口。测试数据使用独立的小型合成 fixture，避免复制真实精确轨迹。
- 时间、距离和速度转换先核实源格式与单位；筛选与统计应覆盖空数据、缺失字段、跨年、不同运动类型和无轨迹活动。
- Classic 地图开关在 `themes/classic/utils/const.ts`。隐私模式需同时检查地图、预览与导出，不应通过增加日志暴露坐标或凭据。

## 验证

```bash
pnpm run check
pnpm exec tsc --noEmit
pnpm exec eslint src --ext .ts,.tsx
pnpm run build
```

- `check` 是 Prettier 检查，不包含 TypeScript 类型检查；`lint` 带自动修复，不适合只读验证。
- 修改共享层或主题注册时分别以 `theme_preset: classic` 和 `theme_preset: dashboard` 构建；切换前保存原配置，结束后仅恢复本次临时修改，保留用户已有配置。
- 改路由或资产 URL 时分别用 `PATH_PREFIX=/` 和 `PATH_PREFIX=/watson-running` 构建，并在预览中验证首页、`/summary`、直接访问、刷新和静态资源路径。
- 改筛选、统计或地图时补充针对性测试；浏览器检查覆盖桌面/窄屏、亮/暗主题、键盘/触摸、地图联动、瓦片失败和隐私模式。构建成功不能证明外部地图服务可用。
- 本仓库尚无独立前端单测命令，不要报告不存在的测试通过。新增测试需提供可重复执行的入口，交付时明确真实执行范围。
