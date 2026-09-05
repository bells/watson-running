# Python 数据管道协作指南

适用于 `run_page/` 及所有子目录，补充[根级指南](../AGENTS.md)。命令均在仓库根目录执行。

## 模块职责

- `*_sync.py` 负责各平台或文件格式的导入；先阅读目标适配器的参数、凭据来源、文件写入与主入口，再决定如何测试。
- `generator/db.py` 定义 SQLAlchemy 模型、`ACTIVITY_KEYS`、数据库初始化和活动写入；`generator/__init__.py` 负责活动加载、统计、隐私处理与室内轨迹修复。
- `gpxtrackposter/track_loader.py` 提供 `TrackLoader` 和 GPX/TCX/FIT 加载能力，`gen_svg.py` 编排图形生成；新增导入能力优先复用这些模块。
- `tui/data.py` 解析 JSON、转换单位并聚合活动，`tui/app.py` 承载 Textual 交互，`tui/braille.py` 绘制终端轨迹。业务计算保持可独立测试。
- Python 是离线数据管道和本地 TUI；项目对应的业务后端是独立仓库 `bells/run-agent`，Java 服务职责留在该仓库。

## 数据变更规则

- 数据库字段或输出格式修改需一起检查数据库模型、序列化、前端两份 `Activity` interface 和 TUI 的 `Activity`。保持时间、距离、速度和运动类型语义一致。
- 网络访问处理超时、认证失败、限流与重试；回归测试使用 mock 或固定响应，不依赖真实平台账户和在线地理编码。
- 同步和生成脚本可能在导入或初始化时访问文件、数据库或网络，先审查副作用再导入测试。使用临时目录、临时数据库与合成轨迹，显式重定向输入输出路径。
- 未明确要求数据操作时，不运行 `gpx_sync.py`、平台全量同步、`db_updater.py`、`gen_svg.py` 或 `pnpm run data:clean`。`--from-db` 仍可能写 JSON/SVG，不代表只读。
- 隐私处理必须覆盖保存前、JSON 输出和展示链路；修复生成器后，再在获授权的数据范围内重新生成，不直接修补真实数据库、轨迹或 JSON。
- 数据刷新需要报告活动数量、最新时间、类型分布、数据库/JSON 一致性，以及轨迹和 SVG 的增删变化；避免在交付日志中打印精确路线。

## 环境与验证

- 本地 `.python-version` 为 3.12，`pyproject.toml` 要求 3.12+；Python CI 为 3.12–3.14，同步 Workflow 为 3.11，Docker 为 3.10。按实际执行路径判断语法与依赖兼容性。
- CI 通过 `requirements-dev.txt` 引入 `requirements.txt`，同步与 Docker 直接安装 `requirements.txt`；项目安装与锁文件还涉及 `pyproject.toml`、`uv.lock`、`pdm.lock`。更改依赖时检查各入口差异，不能只更新其中一份就宣称全部路径可用。

```bash
python3 -m compileall run_page
black . --check
ruff check .
```

- 以上检查需要目标环境预先安装依赖和检查工具；语法检查不证明运行时依赖兼容。
- TUI 修改额外运行 `python3 -m unittest test_tui_app`。该套件使用临时 JSON 和 Textual `run_test()`；根目录 `test_real.py`、`test_tui.py` 属于交互调试入口。
- 生成器或导入器修改补充最小隔离测试，覆盖去重、时间/单位、空轨迹、缺失字段及本次修复场景。CI 中的 GPX 同步是有数据副作用的检查，不要直接复用于本地只读验证。
