# 运行时与直接依赖审计（2026-09-28）

数据来源：本仓库 `package.json`、`pnpm-lock.yaml`、`pyproject.toml`、`requirements*.txt`、`uv.lock`、`pdm.lock`；2026-09-28 对 [npm registry](https://registry.npmjs.org/) 与 [PyPI](https://pypi.org/) 官方元数据的只读查询。`pnpm audit --json` 对当前锁文件报告 558 个依赖、0 个已知公告；[OSV 查询接口](https://google.github.io/osv.dev/post-v1-querybatch/) 对 uv 锁中的 36 个 Python 直接依赖版本报告 0 个匹配公告。这些查询不证明未来安全或所有传递依赖安全。

## 运行路径

| 路径 | 现状 | 决定 |
| --- | --- | --- |
| 本地 | Node 24.20.0、pnpm 8.9.0、Python 3.14.7；`.python-version` 为 3.12 | Node 24 为构建基线，Python 最低 3.12；pnpm 升至 12 并重新验证锁文件 |
| Node CI | 20/22/24，`pnpm install` | 收敛到 Node 24，冻结安装；Vite 8 最低 20.19，最新版 ESLint React 要求 22+ |
| Pages | Node 20，全局安装 Corepack，非冻结安装 | Node 24，按 `packageManager` 使用 Corepack 与冻结安装 |
| Python CI | 3.12/3.13/3.14；requirements-dev.txt | 保留矩阵，隔离安装并补运行相关测试 |
| 暂停的数据同步 | Python 3.11，job 禁用 | 声明改为 3.12，保持 job 禁用 |
| Docker | Python 3.10.5、Node 18，安装旧镜像/非冻结 pnpm | 换 Python 3.12、Node 24 与冻结安装；数据生成阶段只在隔离 fixture 验证 |

## 前端直接依赖

表中“升级”指在当前主版本或相容范围内刷新，不代表盲目采用最新主版本。官方 npm 页面可核对发布、Node engines、废弃标记与维护入口。React 19、Router 7、Vite 8 和地图双实现保留；TypeScript 7 暂不采用，因为 `@typescript-eslint/parser@8.70.1` 的官方 peer 范围是 `>=4.8.4 <6.1.0`。

运行时兼容的关键下限：Vite 8 与 `@vitejs/plugin-react` 要求 Node `^20.19.0 || >=22.12.0`；ESLint 10 要求 `^20.19.0 || ^22.13.0 || >=24`；`@eslint-react/eslint-plugin@5.21.0` 要求 Node `>=22`。这些 npm `engines` 与 [pnpm 12 的 Node >=18 要求](https://www.npmjs.com/package/pnpm) 使 Node 24 可作为同一受支持目标。npm 的当前发布版本、废弃标记和项目主页用作维护证据；没有把无更新的成熟库直接判为废弃。

实施复核：pnpm 12 对刚发布的 `@eslint-react/eslint-plugin@5.21.0` 提示需要自动加入 13 个 `minimumReleaseAgeExclude` 例外。保留供应链发布年龄策略，锁定已安装并通过检查的 5.20.8；不提交这些例外。`@types/node` 调整为 Node 24 对应的 24.19.0。

核心库 peer 检查：[react-map-gl 8.1.3](https://www.npmjs.com/package/react-map-gl) 声明 React >=16.3、Mapbox GL >=1.13、MapLibre GL >=1.13；[Recharts 3.10.1](https://www.npmjs.com/package/recharts) 声明 React 16–19；[React Router DOM 7.18.4](https://www.npmjs.com/package/react-router-dom) 声明 React >=18、Node >=20。当前组合满足这些范围。一次 Classic 构建中 Mapbox GL chunk 约 1.84 MB、Classic chunk 约 1.27 MB（均为未 gzip）；地图和复杂统计仍需后续按页面加载优化，不能以此次迁移声称包体积已改善。

| 包 | 声明 / 锁定 / 官方最新 | 决定与依据 | 官方来源 |
| --- | --- | --- | --- |
| `@mapbox/mapbox-gl-language` | `^1.0.1` / `1.0.1` / `1.0.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@mapbox/mapbox-gl-language) |
| `@mapbox/polyline` | `^1.2.1` / `1.2.1` / `1.2.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@mapbox/polyline) |
| `@math.gl/web-mercator` | `^4.1.0` / `4.1.0` / `4.1.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@math.gl/web-mercator) |
| `@svgr/plugin-svgo` | `^8.1.0` / `8.1.0` / `8.1.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@svgr/plugin-svgo) |
| `@vercel/analytics` | `^2.0.1` / `2.0.1` / `2.0.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@vercel/analytics) |
| `@vitejs/plugin-react` | `^6.1.1` / `6.1.1` / `6.1.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@vitejs/plugin-react) |
| `gcoord` | `^1.0.7` / `1.0.7` / `1.0.7` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/gcoord) |
| `html-to-image` | `^1.11.13` / `1.11.13` / `1.11.13` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/html-to-image) |
| `mapbox-gl` | `^3.23.0` / `3.31.0` / `3.31.0` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/mapbox-gl) |
| `maplibre-gl` | `^6.11.2` / `6.11.2` / `6.11.2` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/maplibre-gl) |
| `rc-virtual-list` | `^3.19.2` / `3.19.2` / `3.19.2` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/rc-virtual-list) |
| `react` | `^19.2.5` / `19.3.0` / `19.3.0` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/react) |
| `react-dom` | `^19.2.5` / `19.3.0` / `19.3.0` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/react-dom) |
| `react-ga4` | `^3.0.1` / `3.0.1` / `3.0.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/react-ga4) |
| `react-helmet-async` | `^3.0.0` / `3.0.0` / `3.0.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/react-helmet-async) |
| `react-map-gl` | `^8.1.1` / `8.1.3` / `8.1.3` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/react-map-gl) |
| `react-markdown` | `^10.1.0` / `10.1.0` / `10.1.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/react-markdown) |
| `react-router-dom` | `^7.18.4` / `7.18.4` / `7.18.4` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/react-router-dom) |
| `recharts` | `^3.8.1` / `3.10.1` / `3.10.1` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/recharts) |
| `remark-gfm` | `^4.0.1` / `4.0.1` / `4.0.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/remark-gfm) |
| `vite` | `^8.3.1` / `8.3.1` / `8.3.1` | 保留；当前主版本与运行路径吻合，暂无替换收益；需浏览器回归 | [npm](https://www.npmjs.com/package/vite) |
| `vite-plugin-svgr` | `^5.2.0` / `5.2.0` / `5.2.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/vite-plugin-svgr) |
| `@eslint-react/eslint-plugin` | `^5.18.6` / `5.20.8` / `5.21.0` | 保留已验证的 5.20.8；5.21 需要发布年龄例外，且要求 Node >=22 | [npm](https://www.npmjs.com/package/@eslint-react/eslint-plugin) |
| `@eslint/js` | `^10.0.1` / `10.0.1` / `10.0.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@eslint/js) |
| `@modyfi/vite-plugin-yaml` | `^1.1.1` / `1.1.1` / `1.1.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@modyfi/vite-plugin-yaml) |
| `@tailwindcss/vite` | `^4.2.4` / `4.3.3` / `4.3.3` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@tailwindcss/vite) |
| `@types/geojson` | `^7946.0.16` / `7946.0.16` / `7946.0.16` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@types/geojson) |
| `@types/mapbox__polyline` | `^1.0.5` / `1.0.5` / `1.0.5` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@types/mapbox__polyline) |
| `@types/node` | `^25.6.0` / `25.9.8` / `26.6.3` | 改为 Node 24 类型，与唯一构建基线一致；26 属另一主版本 | [npm](https://www.npmjs.com/package/@types/node) |
| `@types/react` | `^19.2.14` / `19.3.0` / `19.3.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@types/react) |
| `@types/react-dom` | `^19.2.3` / `19.3.0` / `19.3.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@types/react-dom) |
| `@typescript-eslint/eslint-plugin` | `^8.59.1` / `8.70.1` / `8.70.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@typescript-eslint/eslint-plugin) |
| `@typescript-eslint/parser` | `^8.59.1` / `8.70.1` / `8.70.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/@typescript-eslint/parser) |
| `eslint` | `^10.9.1` / `10.11.0` / `10.11.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/eslint) |
| `eslint-plugin-react-hooks` | `^7.1.1` / `7.1.1` / `7.1.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/eslint-plugin-react-hooks) |
| `globals` | `^17.6.0` / `17.12.0` / `17.12.0` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/globals) |
| `prettier` | `^3.8.3` / `3.9.9` / `3.9.9` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/prettier) |
| `prettier-plugin-tailwindcss` | `^0.8.0` / `0.8.1` / `0.8.1` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/prettier-plugin-tailwindcss) |
| `tailwindcss` | `^4.2.4` / `4.3.3` / `4.3.3` | 保留；当前主版本与运行路径吻合，暂无替换收益 | [npm](https://www.npmjs.com/package/tailwindcss) |
| `typescript` | `^6.0.3` / `6.0.3` / `7.0.2` | 保留 6；ESLint TypeScript peer 尚不支持 7 | [npm](https://www.npmjs.com/package/typescript) |

## Python 直接依赖

`pyproject.toml` 是项目与 uv/PDM 解析入口；`requirements.txt` 是 CI、同步和 Docker 的直接安装入口，不能假定它们自动同步。`requirements-dev.txt` 继承后者。`uv.lock` 与 `pdm.lock` 当前均存在，PDM 的 `openai` 仍锁为 1.97.1；调整应同步生成并验证两个锁。`stravaweblib==0.0.10` 要求 `stravalib<1`，所以 2.6.0 不能直接替换 0.10.4。`cairosvg` 被 `auto_share_sync.py` 使用却仅在项目依赖中，`requirements.txt` 注释掉；`svglib` 在该脚本已替换且源码未发现导入，拟移除。

实施后关系：`pyproject.toml` 是人工维护的项目依赖声明；`requirements.txt` 是 pip 执行路径的直接依赖镜像，`requirements-dev.txt` 只加开发检查工具；`uv.lock`、`pdm.lock` 分别由 uv、PDM 从项目声明生成。已核对项目和 requirements 的直接包名集合一致，并同步固定 `cloudscraper`、`stravaweblib`、`openai` 与 `certifi`；requirements 补入 `cairosvg` 和 `textual`。两份锁均解析到 `stravalib 0.10.4`、`stravaweblib 0.0.10`、`openai 3.6.0`、`cairosvg 2.9.1`，且均不再包含 `svglib`。

隔离验证：Python 3.12、3.13、3.14 的 `uv sync --frozen` 均成功；3.12 的 requirements-dev 安装、Black、Ruff、compileall 和 16 项安全单元测试通过；3.13/3.14 同一套 16 项测试亦通过。Textual 在 3.13/3.14 测试中输出 `ResourceWarning`，但测试结果均为成功。测试不涉及真实 GPX 导入、平台认证或数据发布。Docker daemon 未启动，Docker 镜像本身未构建。

PyPI 最新发布元数据中的 Python 范围已逐项查阅：升级候选中要求最高的是 NumPy 2.5.3 的 `>=3.12`；SQLAlchemy 2.1.1 要求 `>=3.11`，timezonefinder 9.0.0 要求 `>=3.11,<4`，其余已列候选不高于项目的 3.12 下限。发布元数据作为维护和语法下限证据；具体 wheel、导入与平台行为仍以隔离安装和测试为准。

| 包 | requirements / uv / PDM / 官方最新 | 决定与依据 | 官方来源 |
| --- | --- | --- | --- |
| `aiofiles` | `aiofiles` / `24.1.0` / `24.1.0` / `25.1.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/aiofiles/) |
| `appdirs` | `appdirs>=1.4.0` / `1.4.4` / `1.4.4` / `1.4.4` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/appdirs/) |
| `arrow` | `arrow` / `1.3.0` / `1.3.0` / `1.4.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/arrow/) |
| `black` | `—` / `—` / `—` / `26.5.1` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/black/) |
| `cairosvg` | `—` / `2.9.1` / `2.9.1` / `2.9.1` | 补进 requirements；同步至当前维护版本并测试 SVG 转换 | [PyPI](https://pypi.org/project/cairosvg/) |
| `certifi` | `certifi==2025.1.31` / `2025.1.31` / `2025.1.31` / `2026.7.22` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/certifi/) |
| `cloudscraper` | `cloudscraper==1.2.71` / `1.2.71` / `1.2.71` / `1.2.71` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/cloudscraper/) |
| `colour` | `colour>=0.1.5` / `0.1.5` / `0.1.5` / `0.1.5` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/colour/) |
| `duckdb` | `duckdb` / `1.3.2` / `1.3.2` / `1.5.5` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/duckdb/) |
| `eviltransform` | `eviltransform` / `0.1.1` / `0.1.1` / `1.0.0` | 保留：主版本跳跃，先跑坐标转换回归 | [PyPI](https://pypi.org/project/eviltransform/) |
| `fit-tool` | `fit-tool` / `0.9.14` / `0.9.14` / `0.9.16` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/fit-tool/) |
| `garmin-fit-sdk` | `garmin-fit-sdk` / `21.178.0` / `21.178.0` / `21.217.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/garmin-fit-sdk/) |
| `garth` | `garth` / `0.5.17` / `0.5.17` / `0.8.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/garth/) |
| `geopy` | `geopy` / `2.4.1` / `2.4.1` / `2.5.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/geopy/) |
| `gpxpy` | `gpxpy==1.6.2` / `1.6.2` / `1.6.2` / `1.6.2` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/gpxpy/) |
| `haversine` | `haversine==2.8.0` / `2.8.0` / `2.8.0` / `2.9.0` | 保留：项目固定 2.8.0，先核对计算输出 | [PyPI](https://pypi.org/project/haversine/) |
| `httpx` | `httpx` / `0.28.1` / `0.28.1` / `0.28.1` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/httpx/) |
| `lxml` | `lxml` / `6.1.3` / `6.1.3` / `6.1.3` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/lxml/) |
| `numpy` | `numpy` / `2.3.1` / `2.3.1` / `2.5.3` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/numpy/) |
| `openai` | `openai==3.6.0` / `3.6.0` / `1.97.1` / `3.19.2` | 保留：requirements 与 uv 为 3.6.0，PDM 锁仍是 1.97.1，先统一入口 | [PyPI](https://pypi.org/project/openai/) |
| `polyline` | `polyline` / `2.0.2` / `2.0.2` / `2.0.4` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/polyline/) |
| `pycryptodome` | `pycryptodome` / `3.23.0` / `3.23.0` / `3.23.0` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/pycryptodome/) |
| `pytest` | `—` / `9.0.3` / `9.0.3` / `9.1.1` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/pytest/) |
| `pyyaml` | `pyyaml` / `6.0.2` / `6.0.2` / `6.0.3` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/pyyaml/) |
| `rich` | `rich` / `15.0.0` / `15.0.0` / `15.0.0` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/rich/) |
| `ruff` | `—` / `—` / `—` / `0.16.9` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/ruff/) |
| `s2sphere` | `s2sphere` / `0.2.5` / `0.2.5` / `0.2.5` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/s2sphere/) |
| `sqlalchemy` | `sqlalchemy` / `2.0.41` / `2.0.41` / `2.1.1` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/sqlalchemy/) |
| `stravalib` | `stravalib==0.10.4` / `0.10.4` / `0.10.4` / `2.6.0` | 保留：stravaweblib 要求 <1.0.0 | [PyPI](https://pypi.org/project/stravalib/) |
| `stravaweblib` | `stravaweblib` / `0.0.10` / `0.0.10` / `0.0.10` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/stravaweblib/) |
| `svglib` | `—` / `1.5.1` / `1.5.1` / `2.2.0` | 移除未使用的项目依赖；生成器不用它 | [PyPI](https://pypi.org/project/svglib/) |
| `svgwrite` | `svgwrite>=1.1.9` / `1.4.3` / `1.4.3` / `1.4.3` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/svgwrite/) |
| `tcxreader` | `tcxreader` / `0.4.11` / `0.4.11` / `0.4.11` | 保留；当前版本与使用路径一致 | [PyPI](https://pypi.org/project/tcxreader/) |
| `tenacity` | `tenacity` / `9.1.2` / `9.1.2` / `9.1.4` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/tenacity/) |
| `textual` | `—` / `8.2.4` / `8.2.4` / `8.2.8` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/textual/) |
| `timezonefinder` | `timezonefinder; platform_system == "Windows"` / `6.6.3` / `6.6.3` / `9.0.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/timezonefinder/) |
| `tzfpy` | `tzfpy; platform_system != "Windows"` / `1.0.0` / `1.0.0` / `2.1.0` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/tzfpy/) |
| `tzlocal` | `tzlocal` / `5.3.1` / `5.3.1` / `5.4.4` | 分批升级，核对 Python 3.12–3.14 wheel 与无真实数据测试 | [PyPI](https://pypi.org/project/tzlocal/) |

## 验证与回退

- 前端每批以 `pnpm install --frozen-lockfile`、格式、类型、非修复型 ESLint、`pnpm test:chat` 和双主题构建验收；根路径/子路径分别浏览器检查。包体积以构建产物变化记录。
- Python 每批以隔离安装、Black、Ruff、compileall 和合成数据测试验收；不运行真实同步或生成。当前 PyPI 版本元数据只能证明发行版和 Python 下限，不能证明所有平台导入行为。
- 任何迁移失败时只回退该批声明、锁文件和 CI/Docker 差异；保留公开 JSON/SVG 与仓库外数据主档。
- 安全公告查询：`pnpm audit --json`，以及 OSV `POST /v1/querybatch` 对 36 个 uv 锁定的 Python 直接依赖版本；2026-09-28 均未返回匹配公告。实际隔离安装后的全量依赖仍需在迁移批次复查。
