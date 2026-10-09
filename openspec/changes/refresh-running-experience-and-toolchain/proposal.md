## Why

Watson Running 的首页、汇总页和单次详情页目前采用不同的排版、色彩与数据层级，个人十年跑步记录缺少统一且易探索的叙事。与此同时，前端、Python、CI 与 Docker 的运行时基线不一致；RunAgent 已发展到 v0.4，但前端仍只有开发环境单轮聊天，因此需要一次以真实数据契约、兼容性和隐私为边界的系统升级。

## What Changes

- 为当前使用的 Classic 首页、`/summary`、`/activity/:id` 及开发环境聊天建立统一的运动视觉系统，重新组织年度进展、记录检索、地图与单次训练分析；Dashboard 主题沿用同一基础 token，并保持可用。
- 改进个人记录展示的筛选、联动、缺失数据、无轨迹、窄屏、键盘、触摸、亮暗模式及地图失败状态；保留现有静态生成与公开轨迹隐私规则。
- 审计 React、路由、地图、图表、构建工具、Node、pnpm、Python 包及其锁文件和 CI/Docker 执行路径；仅对有维护、兼容、安全或体验收益且通过验证的项升级，记录保留项与迁移风险。
- 更新开发环境 RunAgent 聊天界面与站点视觉、状态反馈；为后端已存在的 `/api/chat/stream` 和 `/api/agent` 制定版本化 REST/SSE、数据最小化及部署门槛的跨仓库契约，按独立里程碑评审前端接入。当前未版本化接口不被描述成已经上线的生产能力。
- 分阶段交付设计系统、页面与依赖迁移，并以数据正确性、隐私、双主题、子路径、真实浏览器和适用 CI 证据验收。

## Capabilities

### New Capabilities

- `running-record-experience`: 个人跑步记录、年度汇总、单次详情、地图联动与跨页面视觉和交互的一致性。
- `runagent-experience`: 现有开发聊天的体验以及 Streaming Chat 和 Agent 的契约就绪条件。

### Modified Capabilities

无。当前主规格目录尚无已归档的同名能力；已完成的 `add-runagent-chat-ui` 变更作为现有行为约束，不重写其历史。

## Impact

涉及 `src/themes/classic/`、`src/themes/dashboard/`、`src/components/`、`src/core/`、`config.yml`、`package.json`/锁文件、Python 依赖入口、Dockerfile、`.github/workflows/` 与相关文档。RunAgent 仓库在本变更中只作只读契约核对；不迁移或直接改写私有数据库、原始轨迹、公开 JSON/SVG，也不在此提案阶段发布或部署。
