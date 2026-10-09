## 1. 基线与决策证据

- [x] 1.1 记录 Classic 首页、`/summary`、`/activity/:id` 和 Dashboard 的桌面/窄屏、亮/暗、地图失败基线，并列出实际可用交互与视觉问题；用可复看的截图和检查清单验证，截图只使用公开或合成数据。
- [x] 1.2 按 impeccable 的产品/视觉 brief 流程将“赛道记录册”视觉方向、保留的 Watson 标志与文案、语义 token、排版和动效规则落为项目设计文档；用首页、汇总、详情和聊天的统一线框/状态样例审阅。
- [x] 1.3 审计 `package.json`、`pnpm-lock.yaml`、Python 四个依赖入口、Node/pnpm/Python 本地与 CI/Pages/Docker 版本，对每个直接依赖记录保留/升级/替换/移除决定、官方兼容、安全、维护和回退证据；用完整清单和来源链接验证，不以“最新”代替选择依据。
- [x] 1.4 核对 RunAgent 当前 controller/model、Memory 和 Running Tool 行为并标出前端文档中的过期 v0.2 描述；以字段、事件及当前/拟议状态表验证，不修改独立后端仓库。

## 2. 工具链与依赖迁移

- [ ] 2.1 修齐 Docker、Pages、CI 和本地目标的 Node/Python 版本及安装命令，保留数据同步 job 的暂停状态；用各目标的冻结安装/构建或等效隔离 CI 结果验证，不运行真实数据同步。
- [x] 2.2 根据 1.3 的证据决定 pnpm 是否升级；若升级，同一批更新 `packageManager`、lockfile、Corepack/Action 与文档，并以 `pnpm install --frozen-lockfile` 和双主题构建验证；若保留，在清单中记录兼容证据。
- [x] 2.3 分批处理前端直接依赖的升级/替换/移除，特别复核 React 19、Router 7、Vite 8、地图和 Recharts 的官方兼容与包体积；每批通过类型检查、非修复型 ESLint、`pnpm test:chat` 和构建，记录被保留的包。
- [x] 2.4 明确 Python 依赖入口的权威关系并按 1.3 结果分批调整版本/锁文件，重点验证 `stravaweblib` 与 `stravalib`、平台包及 Python 3.12–3.14；每批用隔离安装、Black、Ruff、compileall 和相关无真实数据测试验证。

## 3. 共享视觉与展示语义

- [x] 3.1 建立明暗语义 token 与 Classic/Dashboard 旧变量映射，统一文字、数字、焦点和图表图例；用对比度检查、两主题截图和既有页面无明显回归验证。
- [x] 3.2 将期间范围、距离/配速/时长、缺失值、运动类型和记录排序的展示逻辑抽到 `src/core/` 纯函数/Hook；以合成数据测试覆盖跨年、空值、不同运动和无轨迹，核对 Python/两份 TypeScript/TUI 字段语义。
- [x] 3.3 建立可复用的加载、空结果、错误、地图不可用和减少动态效果状态样式；用键盘、窄屏、亮暗及 `prefers-reduced-motion` 浏览器场景验证。

## 4. 跑步记录页面

- [x] 4.1 统一单次详情页的 token、导航、数字层级和缺失明细/采样处理，保留现有分段与曲线事实；用公开数据只读比对及失败注入验证值、单位、估算标识、返回和重试。
- [x] 4.2 重组 Classic 首页首屏、累计/年度信息和记录入口，修复地图失败时的大面积空白；用年份切换、记录定位、瓦片失败与无轨迹浏览器场景验证。
- [x] 4.3 改造 Classic 列表与移动端记录查看，保持排序、筛选和分页，避免横向滚动成为唯一入口；用桌面/窄屏、键盘/触摸和空结果验证。
- [x] 4.4 将 `/summary` 改成可读的周期历程视图并打通单次详情入口，明确累计与所选周期范围；以月/周/年切换、跨年和数据数值比对验证。
- [x] 4.5 将 Dashboard 共享色彩、数据格式、选中和失败状态与新系统对齐，保持其现有热力图、地图、日志和轨迹页可用；用 Dashboard 根路径/子路径构建与浏览器 smoke 验证。

## 5. RunAgent 体验与契约

- [x] 5.1 让开发环境聊天采用共享视觉与状态组件，保留单轮 `/api/chat`、内存态、输入限制、60 秒超时、取消、手动重试和安全 Markdown；用 `pnpm test:chat` 与开发浏览器故障注入验证，生产构建确认入口缺席。
- [x] 5.2 写出拟议 `/api/v1` Chat、SSE 和 Agent 契约及 JSON/SSE fixtures，逐字段标注与当前 `token/error` 流、Agent DTO 的差异及缺少的 complete/错误码/认证/重连语义；用 schema/fixture 校验和独立后端源码复核验证，不启用新入口。
- [x] 5.3 明确 Running Tool 数据来源、最小字段、只读限制、conversationId 非授权属性与部署前置条件，更新前端集成文档；用隐私检查清单核对示例不含原始轨迹、精确端点、凭据或私有备注。

## 6. 集成验收与交付

- [x] 6.1 对 Classic 与 Dashboard 分别执行 `pnpm run check`、`pnpm exec tsc --noEmit`、非修复型 ESLint、相关测试和构建，根路径与仓库子路径各验证首页、汇总、详情直达/刷新及资产 URL，并恢复用户原配置；记录每项实际结果。
- [x] 6.2 在真实浏览器审查桌面/窄屏、亮/暗、键盘/触摸、地图失败、无轨迹、空/缺失数据和 reduced motion；按 impeccable 做一次集中缺陷修复与一次确认，并记录不能由自动化证明的外部地图/设备边界。
- [x] 6.3 审计最终 diff、公开数据/轨迹文件是否未被意外修改、`git diff --check` 和 OpenSpec 严格校验；交付版本决策表、视觉样例、验证记录及 RunAgent 后续里程碑条件，不以本地构建声称生产部署完成。

验收证据与未完成边界见 [verification.md](verification.md)。2.1 的容器验证等待 Docker daemon 可用；未执行真实数据同步、推送或部署；本地代码提交状态以 Git 历史为准。
