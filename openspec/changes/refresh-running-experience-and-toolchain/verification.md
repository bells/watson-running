# 实施与验收记录

日期：2026-10-07。分支 `main`，`origin=bells/watson-running`。本轮承接已有未提交工作；没有创建提交、推送、部署或归档，没有修改独立 RunAgent 仓库。

## 最终行为

- 两套主题使用共享亮暗 token、主题状态、焦点和 heatmap 色系；明暗状态同时作用于 `.dark` 与 `data-theme`。
- Classic 首屏明确累计范围、最近一次跑步和当前筛选范围；年度/运动类型可组合筛选。记录先于地图，地图失败或无公开轨迹时保留其他信息。
- 列表保留双向排序、分页、每页数量、地图定位和详情入口；窄屏有纵向记录。详情返回保留年份、运动类型、周期和选中记录，含 `/watson-running/` 部署前缀。
- 汇总按年/月/周/日/历程呈现可读周期，展开后有分布图和记录；跨年周从周一开始。距离/时长加总，配速按具备时长的距离加权；缺失项不补零。
- 详情统一数字、单位和曲线语义色，保留每公里分段、估算步幅与来源说明；HTTP/JSON 失败保留已有概览并提供重试，缺失采样/分段有明确说明。
- Dashboard 保留热力图、日志、足迹地图和轨迹墙，Header 使用 Watson 标识；轨迹墙复用 RouteMap，缺少 Mapbox token 时局部降级。轨迹选择可用键盘。
- Classic 复用共享活动 Suspense cache，修复全局错误边界只重置 Dashboard cache、Classic 重试仍失败的问题。
- MapLibre Worker 通过 `?worker&url` 交由 Vite 打包依赖，避免仅复制 `.mjs` 导致生产 Worker 引用缺失。
- 开发 Chat 使用共享等待/错误状态、取消等待与手动重试，维持单轮 `/api/chat`、内存态、4000 UTF-16 单元限制、整次请求60秒时限与安全 Markdown。
- v1 JSON/SSE 契约与合成 fixtures 位于 `docs/contracts/runagent-v1/`；只是拟议协议，没有启用生产入口。

## 本地检查

| 检查      | 实际结果                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 环境      | Node 24.20.0 / pnpm 12.6.0                                                                                                            |
| 冻结安装  | `pnpm install --frozen-lockfile` 通过；离线首次缺少 tarball，使用本地代理在线补齐后通过                                               |
| 格式      | `pnpm run check` 通过                                                                                                                 |
| 类型      | `pnpm exec tsc --noEmit` 通过                                                                                                         |
| ESLint    | 非修复型全量检查：0 errors，33 warnings；集中在旧 Dashboard Hooks、ref 命名、array index key 和 Locale Context 写法，未宣称零 warning |
| Chat      | `pnpm test:chat` 8/8                                                                                                                  |
| 展示语义  | `pnpm test:display` 3/3                                                                                                               |
| 期间聚合  | `pnpm test:summary` 3/3：跨年周、距离/秒、加权配速、其他运动、空与缺失/零                                                             |
| 契约      | `pnpm test:contracts` 3/3：JSON schemas、非法输入、SSE sequence/terminal                                                              |
| OpenSpec  | `openspec validate refresh-running-experience-and-toolchain --strict` 通过                                                            |
| Git       | `git diff --check` 通过；用户已有改动保留                                                                                             |
| CodeGraph | 当前索引 up to date，169 files                                                                                                        |

两主题分别以 `PATH_PREFIX=/` 与 `/watson-running` 构建，共四次通过。构建脚本在 finally 恢复 `config.yml` 原始内容；生产 manifest 均不含 ChatAssistant chunk。各产物位于 `/tmp/running-refresh-build/{classic,dashboard}-{root,sub}`，对应日志与 results.json 同目录。本地预览的 PATH_PREFIX 与构建必须相同，不能用根路径 preview 误测子路径资源。

Python 依赖批次及 3.12–3.14 隔离验证沿用前次任务 2.4 的已完成记录；本轮未修改 Python 依赖/运行源码或执行真实同步。Docker 增加 Cairo 系统库、Node 冻结安装复制 pnpm-workspace.yaml；Vite 配置使用 import.meta.dirname；CI 增加类型、非修复型 lint 与四条测试命令。

## Chromium 浏览器结果

生产矩阵四种组合均通过：

| 主题      | 前缀               | 页面/刷新/资产                                                                         |
| --------- | ------------------ | -------------------------------------------------------------------------------------- |
| Classic   | `/`                | 首页；汇总月/周/年/日切换、直达/刷新；详情直达/刷新/返回；activities 与 detail 资产200 |
| Classic   | `/watson-running/` | 同上，资源与链接保持前缀                                                               |
| Dashboard | `/`                | 首页热力图/日志；轨迹墙进入/键盘选中/返回；详情直达/刷新/返回                          |
| Dashboard | `/watson-running/` | 同上，资源与链接保持前缀                                                               |

Dashboard 为单页主题，没有独立 `/summary` 页面。矩阵未出现 pageerror 或 Worker failed to load；生产没有 Chat 入口、没有 Chat/Agent/Stream API 请求。1440×1000 与390×844页面无 document 横向溢出。Classic `2025 + Run` 首页/汇总均核对654.9km，返回详情后年份、运动类型、选中 hash 和 summary 周期保留。

只读公开详情核对：`96915753` 的20170m、7029s、1406 samples、21 splits在根/子路径、两主题加载一致；详情展示20.17公里、1:57:09、5′48″/km，与文件相符。保留估算步幅标识，未重算生成数据。

合成故障/边界检查通过：

- 地图瓦片失败、重试、失败区域220px，其他记录可浏览；坐标为空的 features 不再当成公开路线。
- 无轨迹、空筛选、整个空数据集、Run/Walk、2025-12-31与2026-01-01同属2025-12-29开始的一周。
- 详情503→重试成功；形状不完整JSON安全拒绝；无心率采样、无splits明确提示。
- 全局 activities503→重试重新fetch成功；触摸 context 下点击记录、取消定位和主题；select高度44px。
- 隐私模式以浏览器拦截修改仅测试模块、合成路线及本地空地图style验证：隐藏 Light 控件；恢复普通模式后控件出现。没有改源配置或真实导出。
- `prefers-reduced-motion: reduce` 下上述内容和交互仍可用；键盘进入轨迹选择、列表排序双向切换与分页。
- 开发 Chat 原有回归覆盖11次拦截请求：空输入/示例/IME/防重复/清除/迟到结果/错误/手动重试/安全Markdown/滚动/关闭/焦点/亮暗与320–390px。

## RunAgent 联调与里程碑

用户已启动的8080服务经Vite代理 `/api/chat` 实际返回HTTP200，浏览器请求只含message；普通知识问题得到非空回答（131字符）。没有读取真实个人运动记录来验证AI结果。

本轮只读核对controller/model/service/Running Tools与RAG配置：v0.5 Knowledge入口和RAG advisor独立，v0.4 Agent/Memory路径保留。此源码核对与单次Chat成功不等于v0.4 Agent/Memory或v0.5 RAG完整运行回归。

后续Streaming/Agent生产接入先满足：双方字段和字符计数一致、terminal SSE/安全错误、同源代理或受限CORS、认证与conversationId作用域、取消的服务端语义、无自动重试/不续传声明，以及共享fixtures在Java端测试。Running Tools只读最小字段，PB为整次活动±5%距离近似。详见集成文档与契约README。

## 对比度、设计审查与样例

对共享text/muted/accent/success/warning在surface和raised surface上计算WCAG ratio：浅色最低6.01（含曲线则5.07），深色最低6.89（含曲线则6.24）；黄色填充上的深文字11.42。焦点/曲线均超过3:1，正文/次文字超过4.5:1。数值针对共享token的实色组合，不代表旧SVG、第三方底图或整站WCAG认证。

impeccable集中检查后一次收尾review给出四项material fixes，已全部落实：子路径返回、最近跑步入口、记录优先于地图、Dashboard Watson识别。延续已确定brief及线框，无新概念comp/QUALITY BAR卡；没有将缺少新seed算成未选方向。documenter从成品写入根目录DESIGN.md及sidecar。没有追加纯装饰迭代。

样例在 `output/playwright/refresh-*.png`：Classic首页桌面/窄屏、汇总、详情；Dashboard首页桌面/窄屏、轨迹墙；地图/详情失败及真实开发聊天。可复用浏览器检查函数和构建脚本保留于 `output/playwright/refresh-running/`；需要本地dev5173及preview4173–4176，使用Playwright CLI run-code传入对应函数。截图和fixture只含已公开或合成数据。

## 隐私审计与未完成项

- `src/static/activities.json`、`public/activity-details/`、`assets/`、GPX/TCX/FIT和`run_page/data.db`均无本任务diff；没有数据生成、下载、迁移或清洗。
- 没有更改500米端点裁剪/短路线策略、没有从私有主档补轨迹；契约fixtures不包含坐标、凭据或私有备注。浏览器没有自动上传活动到RunAgent。
- Docker daemon不可连接：`docker version --format '{{.Server.Version}}'`返回Cannot connect to the Docker daemon。任务2.1保持未完成；需要Docker可用后只构建develop-py/develop-node基础stage及合成数据路径，禁止默认运行真实data stage。
- 尚无本轮远程CI/Pages/生产部署运行证据；本地四构建与preview不代替这些证据。
- 触摸和IME是浏览器模拟，不代表物理iOS/Android设备；外部瓦片成功、设备GPU/网络及部署域名仍需实际环境验证。Dashboard当前未配置Mapbox token，验证了降级和轨迹墙，没有宣称真实Mapbox瓦片成功。

## 2026-10-09 本地提交前复验

- 冻结安装通过；本机离线store缺少tarball，在线冻结安装补齐环境后完成检查，项目声明及锁文件未因安装改写。
- 格式、TypeScript、非修复型ESLint（0 errors / 33 warnings）和17项前端/契约测试通过。Classic/Dashboard各以根路径和子路径构建，四次通过且无ChatAssistant生产chunk，原config.yml恢复。
- Python 3.12.13：compileall、Black和Ruff通过；private_data_config、generator_privacy与TUI共16项隔离测试通过。本机虚拟环境补齐Black，并按uv.lock约束安装Textual，不修改依赖声明和锁文件。
- 修正README残留的Node 20下限为Node 24，格式化随验收保存的build-matrix.py；Workflow YAML结构检查通过，sync仍仅手动触发且job被禁用。未运行actionlint（环境未提供）。
- git diff --check、OpenSpec严格校验通过，公开运动数据/轨迹/生成资产无diff。浏览器证据沿用10月7日验收，本轮没有重跑浏览器、容器、远程CI或部署；2.1保持未完成。
