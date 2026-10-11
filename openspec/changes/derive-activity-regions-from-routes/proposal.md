## Why

`activities.location_country` 将悦跑圈的城市、省份拼成自由文本，存在“深圳:广东”“深圳市:广东省”等别名，没有显式国家，也无法表达一条活动跨市、跨省或跨国。前端名称归一化解决了重复显示，却仍将整条活动的距离归给一个城市；需要在保留平台数据的基础上，用真实轨迹产生可追溯、可重算的地区归属。

## What Changes

- 首期覆盖用户确认的 **全球国家 + 中国省级、地级市及同级行政地区**；海外省市标记为范围外，后续可扩展。使用地区编码及父级关系保持唯一性，直辖市不按城区重复计数。
- 保留 `activities.location_country`、运动事实、私有轨迹及 `joyrun_details` 平台记录；新增地区目录、每活动计算摘要和多地区关联数据，数据库可同时查看原始名称、规范名称与轨迹结果。
- 在 Python 私有数据管道使用完整真实轨迹与版本化行政边界求交，分别计算国家、省、市的 GPS 里程；同一地区多次进入累加，跨地区活动归属多个地区。
- 将国家、省、市的主要地点作为便于浏览的派生信息，保留完整经过地区；分别记录确认里程、不确定里程、未覆盖情况和计算来源。悦跑圈总里程不被重算或按比例偷偷分摊。
- 提供默认只读的迁移/回填预览、活动级事务、失败续跑、输入版本失效检测和私有备份恢复流程；日常 JoyRun 同步可增量计算，地理故障不丢失基础活动。
- 在公开活动 JSON 增加可选、无坐标的地区汇总。Classic 地区列表、筛选和详情，以及 Dashboard 地区计数/省份联动和 TUI 消费共享语义；旧 JSON 保持可用，平台归属与轨迹验证统计明确区分。
- 保留每端 500 米裁剪和不足时展示原短轨迹的规则；室内借用路线不参与地区计算。计算使用私有轨迹，浏览器只读取已有公开路线和粗粒度地区汇总。
- 新增离线合成测试，覆盖跨界、重复进入、别名、同名地区、边界漂移、缺失 GPS、坐标系、国际日期变更线、回填幂等、失败恢复和隐私回归。

## Capabilities

### New Capabilities

- `activity-region-attribution`: 原始与派生数据分离、规范地区目录、版本化离线边界、跨地区轨迹里程计算、状态与来源、迁移回填和脱敏导出。
- `activity-region-experience`: 公开地区契约、轨迹验证地区统计、跨地区筛选、主要地点及来源说明，以及两套主题和 TUI 的兼容行为。

### Modified Capabilities

无。当前 `openspec/specs/` 尚无已归档主规格；`running-record-experience` 位于另一活动 change 的 delta 中，不对其使用不存在的主规格执行 `MODIFIED`。本方案补充地区能力并遵循其运动事实与公开地图隐私要求；不修改该活动 change。

## Impact

- Python：`run_page/generator/db.py`、`generator/__init__.py`、`joyrun_sync.py`、`joyrun_detail_sync.py`、`private_data.py`、`tui/data.py`；新增 `run_page/geography/` 服务及 `run_page/geography_backfill.py` 工具。
- 前端：`src/core/activityLocation.ts`、`locationNames.ts`、共享 `Activity` 类型、Classic 兼容类型/Hook/地区筛选/统计、`ActivityDetailPage`、Dashboard `ProfileCard`/`ChinaMap`。从稳定 ID 传递地区筛选，名称仅用于展示。
- 依赖：优先采用 Shapely 2.x 的几何运算/STRtree 与 pyproj 3.x 的坐标转换/测地距离；同步审计 `pyproject.toml`、pip 入口、uv/PDM 锁及 Python 3.12–3.14 执行路径。不引入在线逐点逆地理编码或 GeoPandas/Pandas 大型依赖链。
- 边界包：候选 geoBoundaries gbOpen；须固定实际文件、许可、坐标系、层级及编码映射后启用。现有前端地图 GeoJSON 仅作为展示资产，不默认视为可用于精确归属的边界包。
- 数据交付：公开改动仅为经审计的静态地区汇总；数据库、原始轨迹、边界大文件、私有计算指纹和备份留在仓库外。
- 范围不含真实平台全量重导、后端 RunAgent 集成、海外省市、街道/区县、地图恢复私有轨迹、CI 定时同步恢复或自动部署。实际历史数据回填和发布独立于源码实现与合成验证。
