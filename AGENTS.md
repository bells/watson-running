# Watson Running 协作指南

## 适用范围

本文件适用于仓库根目录及所有子目录。开始任务前先阅读本文件；涉及具体模块时，再读取相邻源码、配置和上游文档，不要只凭文件名推断行为。

### 分目录指南

以下文件补充各模块的具体约定，未重复的规则继续遵循本文件。协作指令统一使用 `AGENTS.md` 文件名，避免再维护内容重复的 `Agent.md` 或 `AGENT.md`。

- [前端指南](src/AGENTS.md)：共享层、两套主题、数据契约与浏览器验证。
- [Python 指南](run_page/AGENTS.md)：同步、生成器、TUI 与隔离测试。
- [自动化指南](.github/AGENTS.md)：CI、数据提交、Pages 与依赖更新。
- [贡献流程](CONTRIBUTING.md)：本地准备、验证选择和交付要求。

### 任务开始流程

1. 阅读根级及目标目录的 `AGENTS.md`，按需查阅相关项目文档、已有决策和记忆；记忆中的状态应以当前源码与配置复核。
2. 运行 `git status --short`、`git branch --show-current` 和 `git remote -v`，区分已有改动与本任务范围。初始化协作文件不代表需要重新初始化 Git、安装全部依赖或重新生成运动数据。
3. 明确涉及前端、Python、数据资产还是部署；跨模块修改前检查 CodeGraph，数据或部署任务再检查相关远程运行状态。
4. 先简述方案与验证范围，再实施最小完整变更。默认用中文交流，保留必要的英文技术名词；注释解释原因，避免复述代码。
5. 完成后报告实际改动、执行过的检查和仍需验证的部分。文档中的计划、Workflow 声明和本地构建成功都不能替代线上验证。

## 项目定位

- 这是 Watson（bells）的个人运动主页，线上地址为 `https://run.watsonzhu.cn/`。
- 当前独立仓库是 `bells/watson-running`，默认分支为 `main`；项目从 Tag `v3.0-upstream-baseline` 开始独立演进。
- 项目最初基于 `yihong0618/running_page`。必须保留原始 MIT License、版权信息、Git 历史与 attribution，不得声称全部代码从零开发。
- Git remote 约定：`origin` 是当前项目，`legacy` 是迁移前的 `bells/running_page`，`upstream` 只用于历史参考。不要直接合并 `upstream/master`，未来引用上游实现必须作为独立变更进行评审。
- 上述是 remote 的角色约定，不代表每个 checkout 都已配置全部 remote；先以 `git remote -v` 核实，不因缺少历史 remote 自动添加或迁移。
- 当前运动数据页面使用静态数据链路。Python 负责同步、清洗和生成运动数据，React/Vite 把生成结果作为静态资源发布；页面通过构建产物 URL 加载 JSON，本仓库不包含运行时业务后端。
- 历史来源与 Watson 的个性化改动长期共存。研究历史实现或重构时，先查 Git 历史和实际差异，保留个人数据、文案、地图设置、隐私处理与页面定制。
- `bells/run-agent` 是 Watson Running 对应的独立后端仓库。前后端计划通过 REST / SSE 集成；本仓库当前尚未实现该接入，不代表后端仓库不存在。Java 21、Spring Boot、Spring AI、Agent、Memory、RAG、MCP 与 Evaluation 归属后端，不要合并进本仓库。
- 涉及后端接口时先阅读 `run-agent` 的协作说明、实际接口与契约，再实现对应 TypeScript 客户端；不要把本文中的规划当作后端已实现接口，也不要在前端另建平行后端。

## 核心数据流

```text
运动平台 / GPX / TCX / FIT
        -> run_page/*_sync.py
        -> run_page/data.db + GPX_OUT/TCX_OUT/FIT_OUT
        -> Generator.load() / gen_svg.py
        -> src/static/activities.json + assets/*.svg
        -> React/Vite
        -> dist/ -> GitHub Pages / Vercel / Nginx
```

- `run_page/generator/db.py` 定义 SQLAlchemy `Activity` 模型、`ACTIVITY_KEYS` 和写入逻辑。
- `run_page/generator/__init__.py` 负责加载、连续运动统计、隐私过滤和室内轨迹修复等归一化逻辑。
- `src/core/types.ts` 的 `Activity` 是 Dashboard 的前端数据契约，Classic 兼容契约位于 `src/themes/classic/utils/utils.ts`。修改数据库字段或 JSON 形状时，必须同步检查 Python 模型、`ACTIVITY_KEYS`、生成逻辑、两份 TypeScript interface 和所有消费者。
- `src/core/hooks/useActivities.ts` 与 `src/themes/classic/hooks/useActivities.ts` 都使用 `src/static/activities.json?url` 和模块级 Suspense cache。数据变化需要重新构建；`fetch` 指向同一站点的静态构建资产，不代表存在后端 API。

## 目录职责

- `config.yml`：3.0 的个性化入口，控制主题预设、语言、外观、运动目标和 Mapbox token fallback；当前个人站点使用 `classic`。
- `src/App.tsx`：主题注册与懒加载入口；内置 `dashboard` 和 `classic`，未知主题回退到 Dashboard。
- `src/core/`：跨主题共享的配置、类型、i18n 和活动数据 Hook；根目录 `src/config.ts`、`src/types.ts`、`src/hooks/*` 多为兼容 bridge。
- `src/themes/dashboard/`：3.0 单页 Dashboard 主题；通用卡片、轨迹页和中国地图组件位于 `src/components/`。
- `src/themes/classic/`：Watson 当前使用的旧版多页面主题。`pages/index.tsx` 负责筛选和地图联动，`pages/total.tsx` 对应 `/summary`，地图、列表、年份与地区统计都在该主题目录内。
- `src/themes/classic/utils/const.ts`：Classic 的地图供应商、隐私、单位和展示开关；真实瓦片加载仍依赖网络和供应商可用性。
- `docs/theme-system.md`：主题扩展边界和新增主题流程。
- `docs/run-agent-integration.md`：对应后端 RunAgent 的仓库职责、规划中的 REST/SSE 合约、隐私与 v0.1 集成边界。
- `docs/repository-independence.md`：独立仓库的 remote、分支、Secrets 与部署迁移约定。
- `run_page/`：数据源适配器、数据库、格式转换及 SVG 生成器。
- `run_page/tui/`：Textual 本地活动浏览器，读取生成的活动 JSON；`data.py` 负责数据解析与聚合，`app.py` 负责交互，`braille.py` 负责终端轨迹绘制。
- `.github/workflows/run_data_sync.yml`：数据同步、生成、提交和部署编排。
- `GPX_OUT/`、`TCX_OUT/`、`FIT_OUT/`、`activities/`、`run_page/data.db`、`src/static/activities.json`、`assets/*.svg`：数据或生成资产，不是普通手写源码。

## 前端约定

- 使用 React 19、TypeScript 6 strict mode、Vite 8、React Router 7、Mapbox GL/React Map GL、Recharts 和 CSS Modules/Tailwind 4。
- 跨主题能力优先进入 `src/core/`；仅 Classic 需要的交互和视觉逻辑留在 `src/themes/classic/`，不要让兼容 bridge 重新成为实现源。
- 保持组件单一职责；复杂派生状态放入纯函数、Hook 或 service，避免继续扩大页面组件。
- 新代码禁止使用 `any`。遇到外部库或未知数据先用 `unknown`、明确 interface 或 union 做类型收窄；修改现有 `any` 时优先顺手消除。
- 路径别名为 `@/* -> src/*`、`@core/* -> src/core/*`、`@themes/* -> src/themes/*`、`@assets/* -> assets/*` 和 `@config -> config.yml`；Vite 与 `tsconfig.json` 必须保持对称。
- Classic 路由为 `/`、`/summary` 和兜底页；Dashboard 是单页主题。部署子路径由 `PATH_PREFIX` / `import.meta.env.BASE_URL` 控制，改路由时必须验证 `BrowserRouter basename` 与 GitHub Pages 子路径。
- 地图和响应式改动至少考虑桌面、窄屏和触摸设备，并检查亮/暗主题、隐私模式、无轨迹数据和瓦片失败状态。
- `VITE_MAPBOX_TOKEN` 和 `config.yml` 中的 Mapbox token 都会进入客户端构建产物，只能使用受 URL/域名限制的公开 token；不要提交账户密钥、平台密码、refresh token 或 Garmin secret string。

## Python 与数据约定

- Python 脚本是数据管道，不是 Tauri 后端，也不是页面运行时服务。
- 新平台适配优先复用 `Generator`、`TrackLoader`、SQLAlchemy 模型和现有格式工具，不要另建平行数据模型。
- 下载、全量重导、数据库迁移和数据清理可能改动数百个轨迹/生成文件；除非任务明确要求，不要运行这些命令。
- 不要手工编辑 `run_page/data.db`、批量修改 GPX 或直接修补 `activities.json` 来掩盖生成器问题。先修数据源/生成逻辑，再重新生成并审计结果。
- 轨迹包含精确位置，仓库又会公开部署。更改 `IGNORE_BEFORE_SAVING`、`IGNORE_START_END_RANGE`、`IGNORE_POLYLINE`、`IGNORE_RANGE` 或地图隐私逻辑时，必须把隐私泄露视为高风险回归。
- 数据刷新后至少核对：活动总数、最新活动时间、运动类型分布、数据库与 JSON 一致性，以及新增/删除的轨迹和 SVG 是否符合预期。
- Python 版本存在真实差异：`pyproject.toml` 要求 3.12+，Python CI 覆盖 3.12-3.14，数据同步工作流使用 3.11，Dockerfile 仍使用 3.10。修改依赖或语法时先明确目标执行路径，不能只在本机版本通过就宣称全链路兼容。

## 当前自动化边界

- `.github/workflows/run_data_sync.yml` 当前声明 `RUN_TYPE: joyrun`，但文件中没有对应的 `joyrun_sync.py` 执行 step。不要假设定时任务会拉取 JoyRun 新数据；修改同步工作流前应先确认期望来源和现有 secrets。
- 工作流可能执行 `git add .`、提交 `update new runs` 并推送当前触发分支。默认目标应为 `main`；开始修改前检查工作树、实际远端与 GitHub Actions 状态，避免与自动生成提交互相覆盖。
- `SAVE_DATA_IN_GITHUB_CACHE=false` 时数据资产会进入 Git；切换缓存策略会改变数据持久化与部署行为，应作为发布/运维变更处理。
- GitHub Pages 的 `PATH_PREFIX` 默认回退为仓库名路径；绑定 `run.watsonzhu.cn` 时 Repository Variable 必须设为 `/`。Secrets、Pages、Vercel 与 Domain 配置不会随 Git 历史自动迁移。

## CodeGraph 使用

- `.codegraph/` 是本地忽略目录，不得提交。守护进程空闲退出是正常行为；需要时命令会重新读取当前源码。
- 开始跨模块修改前运行 `codegraph status .`，再按任务使用：
  - `codegraph query '<symbol>'`
  - `codegraph explore -p . '<feature or flow>'`
  - `codegraph node -p . '<symbol-or-file>'`
  - `codegraph impact -p . '<symbol>'`
  - `codegraph affected <changed-files...>`
- 自动 watcher 通常会追平变更；状态异常时使用 `codegraph sync .`。不要仅以数据库文件存在判断索引新鲜度。
- CodeGraph 当前主要覆盖 Python、TS/TSX、JS 和 YAML；Markdown、SQLite、GPX、JSON 数据内容、SVG 和真实运行时行为仍需直接检查。

## 开发与验证

前端环境：

`package.json` 当前声明 Node `>=20` 和 pnpm `8.9.0`；本地优先使用 Node 24，并遵循 `packageManager` 指定的 pnpm 版本。依赖的实际 Node 下限还需检查锁文件中的 `engines`，不能仅凭项目的 `>=20` 推断所有 Node 20 小版本都可用。CI 覆盖 Node 20/22/24，Pages 使用 Node 20，而 Dockerfile 仍使用 Node 18；修改工具链时一起评估这些路径，不把 Docker 环境当作已验证可用。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

冻结安装失败时先检查 pnpm 版本与锁文件是否匹配，不要把删除或重建锁文件当作初始化步骤。Python 本地版本参见 `.python-version`（当前 3.12）；依赖入口同时存在 `pyproject.toml`、`requirements*.txt`、`uv.lock` 与 `pdm.lock`，应按目标运行路径选用并审计一致性。

前端非破坏性检查：

```bash
pnpm run check
pnpm exec tsc --noEmit
pnpm exec eslint src --ext .ts,.tsx
pnpm run build
```

注意：`pnpm run lint` 带 `--fix`，`pnpm run ci` 会先执行 `format` 和 `lint`，两者都可能改文件。只有在准备接受并审计格式化结果时才运行；运行后必须检查 `git diff`。

Python 检查：

```bash
python3 -m compileall run_page
black . --check
ruff check .
```

- CI 还会运行 `python run_page/gpx_sync.py`，它属于数据路径检查，可能接触生成资产；本地执行前先确认任务范围和工作树。
- TUI 的自动化回归入口是 `python3 -m unittest test_tui_app`，使用临时 JSON 和 Textual `run_test()`；`test_real.py` 和 `test_tui.py` 是交互调试脚本，不能代替自动化测试结果。
- 仓库当前没有独立的前端单元测试套件。涉及筛选、统计、地图、主题、动画或数据生成时，应补充针对性测试；修改共享层或主题注册时，至少分别用 `theme_preset: classic` 和 `theme_preset: dashboard` 构建，之后恢复用户配置。无法自动覆盖的浏览器/地图行为要明确说明手工验证边界。
- 只改文档时至少运行 `git diff --check`；改前端运行 check、非修复型 ESLint 和 build；改 Python 运行 Black、Ruff 与相关脚本的最小安全测试；改数据管道需额外审计生成 diff。

## Git 与交付

- 保留用户已有和自动生成的改动，不得用 `git reset --hard`、`git checkout --` 等方式清理工作树。
- 提交前只暂存本任务文件，先检查 `git status --short`、`git diff --check` 和 staged diff。
- 用户说“提交代码”时，重跑相关检查、创建本地提交并报告 commit hash；除非明确要求，不要 push、打 tag 或归档任务。
- 生成数据常产生很大的 diff。交付说明中区分手写源码、数据库/轨迹、JSON 和 SVG，并报告未完成的真实浏览器、外部平台或部署验证。
- `legacy` 仓库在新仓库 CI、Secrets、Pages、Domain 与线上验证全部稳定之前不得归档；删除分支、Tag、remote 或旧仓库必须获得明确授权。
