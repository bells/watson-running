# 地区能力源码验证记录（2026-10-11）

源码与合成验证阶段完成，OpenSpec 为 35/41：第 3.2 项缺独立 JoyRun CRS 控制点证据，第 9 组为真实边界、主档及发布的独立阶段。历史 JoyRun 保守返回 `unknown_crs`，即使活动改名，只要存在 JoyRun 私有详情来源也不能当成已验证 GPX。没有真实边界通过验收；当前小型身份目录不是全球国家覆盖证明，全球 ISO 映射需随第 9.1 项核对补齐。

## 实现与既有工作

- Python 增加目录、边界准入、原路线适配、版本规则、测地求交、活动事务、默认只读回填、备份与恢复说明。平台距离和原始详情保持独立。
- JoyRun 两个写入 CLI 共用排他锁；基础活动/详情先保存，增量错误可重试，未迁移 DB 保持旧导出。详情输入变化也使结果失效。
- exporter 白名单只发布粗粒度汇总；stale/error 清空旧关系，室内展示借用路线和公开裁剪独立于计算。
- Classic、Dashboard、共享详情与 TUI 分开提供轨迹/平台口径，按稳定 ID 筛选任何可信经过地区。先选年份/类型/时段，再地区；保留平台活动距离和详情入口。
- 保留任务开始前已有的 JoyRun 详情补齐、脚本、地点归一化、ProfileCard 与数据 Hook 改动。city 文件的大 diff 是前序共享名称目录/兼容 bridge，不是删除真实运动记录。

## 本地检查

环境：macOS arm64，Node 24.20.0，pnpm 12.6.0，Python 3.12.13；Shapely 2.2.0、pyproj 3.8.0。

| 检查 | 实际结果 |
| --- | --- |
| `python -m unittest discover -s tests -p 'test_*.py'` | 56 项通过，临时 DB/合成路线/mock 平台响应 |
| `python -m unittest test_tui_app test_generator_privacy test_private_data_config test_dependency_contract` | 20 项通过，含 11 项 Textual 自动回归 |
| `python -m compileall -q run_page` | 通过 |
| `black . --check` / `ruff check .` | 通过 |
| `pnpm run test:geography` | 7 项通过，跨地区、守恒、父级、坏结构及同名标签 |
| `pnpm run test:display` / `pnpm run test:summary` | 7 / 3 项通过 |
| `pnpm run check` / `tsc --noEmit` | 通过 |
| 非修复型 ESLint | 0 error，33 个既有 warning |
| Classic/Dashboard × `/` / `/watson-running` build | 四组合通过，config.yml 原始字节已恢复 |
| `git diff --check` | 通过 |

Python 3.13.12/3.14.7 的固定几何库安装、导入及最小几何/目录/边界测试已运行，最近复核各 3 项几何测试通过；没有在这两个环境安装全部项目依赖或运行完整 56 项回归。CI 配置接入地区测试和 TUI 回归，本地检查不能据此报告远程矩阵已通过。CI YAML 本地解析通过；未安装 actionlint。

可重复执行入口（使用已准备依赖的环境）：

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
.venv/bin/python -m unittest test_tui_app test_generator_privacy test_private_data_config test_dependency_contract
pnpm run test:geography
.venv/bin/python tests/benchmark_geography.py
```

## 浏览器证据

Playwright Chromium headed 与 mobile/touch emulation，仅提供合成 JSON；未修改 `src/static/activities.json`。

- Classic：北京作为非主要城市命中一次，活动显示 21.10 km、北京汇总 8.00 km；全部年份与 2025/2026、运动类型组合生效。平台模式合并深圳别名；键盘 Enter、焦点实线和触摸选择可用。
- Dashboard：键盘选择北京、点击广东，都只显示跨省活动 21.1 km；切回平台模式，2026 内深圳为 22.10 km / 2 次。ProfileCard 与地图沿用同一口径/年份范围。
- 两主题：390×844 亮暗主题无横向溢出，selected/aria-pressed 标签可见，reduced-motion 模拟可用。另检查 1440×1000 桌面。地区面板设置 scroll-margin，避免 Dashboard sticky header 遮住标题。
- 展示地图模块请求失败后，地区按钮仍能筛选，记录与原距离保留。无公开路线时地图局部提示，没有恢复或请求私有路线。
- 详情 404 时，主地点、两省/两市汇总、覆盖说明与基础活动概览继续显示。坏 schemaVersion 局部拒绝，显示“地区结构不可用”，基础 21.1 km 保留。
- 静态构建根路径详情、返回链接和年份/地区联动通过；子路径 `/watson-running/activity/201` 直接访问通过，活动静态资产加载、坏结构局部拒绝及详情缺失状态可用。

截图在本机临时目录：`geography-classic-light.png`、`geography-classic-mobile-dark.png`、`geography-dashboard-dark.png`、`geography-dashboard-mobile-light.png`、`geography-dashboard-mobile-dark.png`。均为合成数据。真实触摸设备、完整屏幕阅读器、供应商瓦片在线稳定性和生产部署未验证。

## 离线性能与幂等

`tests/benchmark_geography.py` 在临时目录创建合成 GPX、已验收/显式允许的合成边界和旧 DB；不访问真实主档或平台。一次记录：

| 指标 | 结果 |
| --- | --- |
| 20 条跨界往返求交（开启 tracemalloc） | 4.956 s |
| Python 分配峰值 | 0.304 MiB，不包含全部 native 库分配 |
| 进程峰值 RSS（含导入与两组测试） | 99.359 MiB |
| 20 条 GPX 完整 apply（含备份、迁移、验收与持久化） | 0.784 s，complete=20 |
| 相同输入二次 apply（仍先备份） | 0.010 s，skipped=20 |

两组路线长度、边界复杂度不同，不能直接比较耗时或外推真实历史活动性能。批次关联不重复；故障/重试、备份失败、锁竞争、WAL 预览拒绝与恢复演练均在临时 DB 测试。

## 数据与交付边界

检查确认 `src/static/`、`assets/`、GPX 主档与真实数据库没有本任务改动；未运行真实平台同步、真实 GPX 导入或公开资产再生成。新 JSON/GeoJSON 仅为共享目录/契约与明确合成 fixture；未新增真实坐标、原响应、账号、密钥、路径或私有指纹到公开汇总。原始详情和路线在 DB 中保持不变的测试覆盖迁移、回填、导出与恢复。

未启用真实边界、未迁移/回填真实主档、未再生成公开 JSON/SVG；源码交付范围为本地 Git 提交，未进行推送、归档、Docker、远程 CI 或线上发布验证。提交前重新运行 Python 76 项测试、前端地区/展示/汇总 17 项测试、格式/类型/lint、两主题根/子路径构建及 OpenSpec strict 校验。真实数据试点/上线按 [回填说明](geography-backfill.md) 和任务第 9 组另行确定范围。
