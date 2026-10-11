## Context

动机与范围见 `proposal.md`；行为契约见两个 delta spec。2026-10-11 的源码与私有主档只读核对显示：

- `activities` 是应用转换后的模型，不是悦跑圈原始响应。`location_country` 实际写入 `city:province`；原列表项和详情记录留在 `joyrun_details.raw_list_json/raw_detail_json`，没有独立国家字段。
- `Generator.load()` 在导出字典上调用 `_fix_indoor_locations()`，随后裁剪公开路线。室内借用路线与公开 JSON 均不能作为地区计算输入。
- `init_db()` 会建表及补列。只读预览必须绕过它和 `Generator` 构造函数。
- 当前 `src/core/activityLocation.ts` 解决展示别名，但按单城市分配整条平台距离；Classic 仍传城市名，TUI 另有地址解析。需要共享契约和稳定 ID，而非继续扩展字符串规则。
- 已有最新活动详情补齐、`joyrunSync.sh` 和名称归一化源码改动属于前序工作。本 change 接续这些入口，不重做其认证/详情逻辑，不改写其他活动 change。

## Goals / Non-Goals

**Goals:**

- 将可独立测试的离线计算服务与 SQLAlchemy 写入、平台同步、公开展示解耦；同一输入和版本产生确定结果。
- 明确区分地区身份、平台声明、真实路线计算和公开地图，支持失败后重试及边界数据尚未就绪的运行。
- 合成测试与源码交付可先完成；真实边界启用、历史主档回填和公开资产发布分别有验收记录。

**Non-Goals:**

- 不建立运行时地理服务，不引入 RunAgent，不用浏览器计算或在线逐点反向地理编码。
- 不恢复丢失的 GPS、不修正平台总距离；不将离线结果称为法律行政界线或设备精度证明。
- 首期不计算海外省市、区县、街道，不把完整路线或过境时间导出给前端。

## Decisions

### 1. 地区身份和原始事实分离

在 `run_page/geography/` 分为 `catalog`、`boundaries`、`routes`、`attribution`、`repository`、`export` 模块。复用既有 SQLAlchemy 活动模型与轨迹解析能力，不扩充 `location_country` 的含义。增加以下表，名称为拟议接口：

| 表 | 关键字段与约束 |
| --- | --- |
| `regions` | `region_id` 主键，`country_code`、`level`、`code_namespace`、`code`、`name`、`parent_id`、`catalog_version`；父级外键，国家无父级；地区编码唯一约束 |
| `region_aliases` | 别名、地区 ID、父级范围、来源及版本；同名允许多候选，不能全局唯一匹配 |
| `activity_region_summaries` | `run_id` 主键/活动外键，平台规范归属、主要国家/省/市 ID、计算状态、各层级覆盖摘要、有效 GPS 长度、输入指纹、路线来源/CRS、目录/边界/规则版本、运行 ID、脱敏错误码及计算时间 |
| `activity_regions` | `(run_id, region_id)` 联合主键、可信距离米；一条活动多次进入同一地区只累加一行 |
| `geography_runs` | 批次 ID、配置版本、计数、状态、私有备份引用；不保存凭据 |

版本变更时摘要与关联在一次事务中整体替换；当前表只保留当前结果，旧结果通过私有备份/批次报告追溯，不无限复制完整轨迹。计算失败或输入失效后，旧关联不能继续参与当前导出。

国家标识示例 `country:CHN`；中国省、市示例 `CHN:province:440000`、`CHN:city:440300`。国家目录采用有版本的 ISO 3166-1 alpha-3 映射；没有适用 ISO 编码的单位使用固定来源命名空间，禁止现场按名称生成 ID。编码撤销/更名通过目录版本和显式继任关系处理，不能把历史 ID 重用于另一地区。

中国市级指地级市及同级自治州/地区等；直辖市用一条市级记录，省级记录是其父级。特区及无地级层的省级单位采用显式、版本化的一对一市级映射，界面标明同级地区，不将辖区算作多座城市。

平台规范归属先解析 JoyRun 原始 `city/province` 或旧 `city:province`，再在父级内查别名。国家只能依据明确平台国家或目录中唯一的省市链推导，并标记 `provider`/`catalog_inferred`；缺失、同名冲突不得默认“中国”。原文本保留。与现有 TS 别名逻辑共用一个小型、版本化目录/别名 fixture，Python、TS、TUI 使用同一语义测试；大边界包不进入前端。

替代方案：给 `activities` 加三个名称字段只能表达单一地点；直接覆盖原文本会失去审计依据；名称主键无法处理别名及同名地区，因此均不采用。

### 2. 离线边界包采用 manifest 和激活验收

边界置于仓库外的 `RUNNING_DATA_DIR/geography/boundaries/<package-id>/`。代码只读取验收通过的 manifest，不在同步过程中自动下载或替换最新边界。manifest 必须包括包版本、实际文件 SHA-256、下载 URL/固定发布或提交、获取日期、每文件上游数据许可及归属声明、真实源 CRS/转换记录、层级语义、编码/父级映射、覆盖范围、已知缺口/争议区、质量检查结果及验收规则版本。

入库接口接受规范 GeoJSON Polygon/MultiPolygon（WGS84），`region_id`/`parent_id` 对应地区目录；原始包转换可用独立离线工具，Shapefile 不直接交给日常同步。验收检查几何有效性、洞/多岛、经纬度范围、反经线、编码唯一性、父子包含关系、同层重叠及缺口。不得静默 `make_valid` 或转换未知 CRS；有修复必须产生新包及报告。小于精度容差的父子误差可截取为可信区域，差集记为不确定；较大不一致拒绝激活。

2026-10-11 的候选核查决定：

- 全球国家以 [geoBoundaries gbOpen](https://github.com/wmgeolab/geoBoundaries) ADM0 为首选候选，必须逐包核对实际许可、年份、覆盖和 ISO 映射；不能将仓库许可或国家目录数量当作全球覆盖证明。统一处理相邻包的重叠/缺口，不强行消除争议区域。
- [geoBoundaries CHN ADM2 元数据](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/CHN/ADM2/geoBoundaries-CHN-ADM2-metaData.json) 标为 **County Level**，2391 个单位，不可直接作为地级市。CHN ADM1 年份 2019、34 个单位且几何较粗，不直接认定适合市界附近的精确归属。
- [ChinaAdminDivisonSHP](https://github.com/GaryBikini/ChinaAdminDivisonSHP) 提供市级 adcode，但 README 声明名义 WGS84 实为 GCJ-02，来源为高德；仓库 MIT 不足以证明上游数据再分发权。只能作为待审候选，不默认启用。
- `src/assets/china-provinces.json` 没有本方案所需的精度、许可与源 CRS 验收记录，保留为显示资产。

因此首期交付一个可验收的包适配器及合成包；真实中国省市包作为具体上线前置项：获取有可核对许可的省级/地级同源边界、行政编码与 CRS 证据，完成上述报告后固定版本。若候选未通过，不伪造或降低标准；源码与合成验证可交付，真实省市上线保持“边界未就绪”。不同层级允许分别激活，通过的国家包仍可独立提供国家结果。

替代方案：在线逆地理编码依赖网络、限流并发送位置；单点结果不能测跨界长度。直接使用展示 GeoJSON 或县级聚合而无地级编码/父级证据也无法保证口径，均不采用。

### 3. 使用成熟几何库，测地长度与拓扑分工

采用 Shapely 2.x 的 line/polygon intersection、STRtree 和 pyproj 3.x 的 CRS 转换、`Geod` 测地距离，避免自己实现通用几何算法；不引入 GeoPandas/Pandas。调查时 Shapely 2.2.0、pyproj 3.8.0 为最新发布且分别使用 BSD-3-Clause、MIT；实施时以 Python 3.12–3.14 的可安装/离线测试结果固定兼容版本，同步全部依赖入口与锁文件，最新版本不是盲目升级要求。

轨迹输入优先使用能验证属于该活动的原始 GPX/TCX/FIT 连续段，缺失时使用 DB 的原始 polyline。利用已有解析器但保留原分段/时间信息，不采用为海报扁平化后的跨段折线。两者都有时检查 ID、来源与长度一致性，冲突给出 `source_conflict`；不得随意选较长路线。JoyRun 请求 `wgs=1` 仅为来源证据之一，须用固定响应/控制点核对，既有轨迹建立来源/CRS 规则，不推断经纬度范围足以证明 WGS84。

输入有效性处理：有限坐标、纬度范围、重复点、明确 segment break、时间倒退、异常移动速度等。初版可配置保守断段阈值：有时间相邻速度超过 60 m/s，无时间相邻距离超过 1000 m 即切断并记录原因。正常跨界长线段仍做完整求交，不靠这些阈值替代归属算法。排除的跳点弦长单独保留私有诊断，不加入有效 GPS 长度分母；没有点的实际运动距离不可知，不虚构“丢失里程”。仅剩单点视为无可用路线。明确室内/现有可靠室内判定在计算前完成，并将判定输入纳入版本。

计算流程：

1. 将真实连续段转换为已验证的 WGS84，按短测地线细分（初版最大 25 m，几何近似误差目标 0.5 m），反经线拆段并统一候选多边形的经度窗口，不能直接连 `179.9 -> -179.9` 的平面直线。
2. STRtree 查候选；在局部米制投影中求交/计算边界缓冲，输出沿轨迹参数的区间。使用 pyproj 测地长度累计区间；不把经纬度或 Web Mercator 的坐标长度当米。极区使用适配的局部投影，转换失败将该段标为不可计算。
3. 每层对所有候选边界的交点切分为互斥区间。唯一命中且远离边界的区间归为可信；重叠、落在边界缓冲或父子冲突的区间归为不确定；没有包/没有覆盖归为未覆盖。层间关联以一致父子链为准。
4. 保守初版规则：边界两侧 30 m 为不确定带；离开原地区后在另一区域内连续行进不足 100 m 就返回原地区的跨界段也转入不确定（不强行归回原市），按行进长度判断而不依赖时间字段。阈值写入规则版本/报告，可在验收证据支持后调节，不能无版本静默修改。沿边界跑步可能没有可信城市结果。
5. 重复进入按地区 ID 累加可信长度。主要地点先选国家最大可信距离，再在该国家内选省、再在该省内选市，同距按 ID 排序；无可信子级时主链在已知层级终止。
6. 每层校验 `可信 + 不确定 + 未覆盖 = 有效 GPS 长度`，容差初版 `max(1 m, 有效长度 * 0.0001)`；失败拒绝写入成功结果。不支持的海外省市长度放在该层未覆盖项、原因为 `out_of_scope`，另给层级状态，不能显示为已计算零里程。只对中国部分可计算时为部分结果。

平台 `Activity.distance` 保持原单位和数值；新增所有距离用米。国家/省/市长度分别统计，禁止把三层相加。首期精度是基于记录轨迹和指定边界的可复现估算，不能恢复两采样点之间的实际行走形状。

替代方案：仅首尾定位会漏掉中途跨界；稀疏抽样会漏掉窄区域；按平台总距离缩放掩盖设备与 GPS 口径差异，均不采用。

### 4. 状态、版本和同步生命周期

总体状态采用 `pending`、`complete`、`partial`、`no_route`、`indoor`、`invalid_route`、`unknown_crs`、`boundary_unavailable`、`stale`、`error`。各层状态为 `complete`、`partial`、`boundary_unavailable`、`out_of_scope`、`unavailable`，附稳定原因码。零长度与未知长度不同：无可用路线的有效长度为 `null`，不确定/未覆盖若不可计算也为 `null`；可测量但没有可信地区时可以为 0。缺少旧记录的 `geography` 由消费者解释为 pending/legacy，不要求为了显示状态批量写数据库。

私有指纹包括选定原路线内容、来源/CRS、分段、室内判定所需事实、地区目录、各层已激活/缺失包声明及规则版本。排除公开裁剪参数、SVG 配置和展示别名文字变更（影响身份的目录变化仍失效）。缺包后激活也必须触发重算。读取结果时校验当前指纹；过期结果只输出 `stale` 及原因，不发布其旧地区里程。

JoyRun 基础活动及已有详情补齐先完成并持久化，再调用增量 geography service，最后走既有导出；兼容 `joyrun_detail_sync.py --from-db`，它读取当前结果而不隐式迁移/回填。新增、缺失、stale/error 的活动进入计算；每活动事务替换摘要及关联。失败保存安全错误码，继续其他活动，CLI 汇总可重试数。详情或轨迹变化会使该活动失效；地理失败不回滚基础活动、详情或要求重新登录。未配置边界时保持平台归属可用。

### 5. 安全预览、显式迁移与恢复

`geography_backfill.py` 默认 dry-run，且不能调用 `init_db()`。使用 `sqlite3` URI `mode=ro&immutable=1`、`query_only` 和旧表列探测；只有无非空 WAL/待恢复回滚日志、主档稳定且写入器停止时才能计算预览。存在这些日志或并发变化时只报需维护窗口，绝不自动 checkpoint/恢复。开始/结束检查主档哈希与 sidecar 清单，若变化则报告预览无效；源 GPX 也检查读取前后变化。报表不含坐标，可写仓库外指定私有目录；默认只输出计数/状态，不生成 JSON/SVG。这避免 SQLite 只读连接也可能创建 `-shm` 的副作用。

apply 前验证私有目录在仓库外、目录 700/DB 600、owner-only umask，并与同步共用排他写入锁。通过 SQLite backup API 创建一致性备份，再显式执行 versioned schema migration；不把地理 DDL 塞入只读预览或无条件生成器初始化。备份失败拒绝后续写入。已有 DB 尚未迁移时常规导出使用旧结构；地理增量提醒需迁移但不阻断同步。

写入后摘要/关联事务、批次进度与输入失效判断支持按 ID/数量继续；确认写入锁下同一活动的源输入未变。`--retry-errors` 重试失败，`--force` 明确重算但仍先备份。无边界的 apply 可仅安装 schema/规范平台归属，轨迹部分记为不可用；不得报真实轨迹回填完成。

以下是**实施后拟提供**的 CLI，不是当前已有命令；环境沿用既有 `RUNNING_DATA_DIR`：

```bash
python run_page/geography_backfill.py --boundaries "$RUNNING_DATA_DIR/geography/boundaries/approved" --dry-run --limit 20
python run_page/geography_backfill.py --boundaries "$RUNNING_DATA_DIR/geography/boundaries/approved" --apply --limit 20
python run_page/geography_backfill.py --boundaries "$RUNNING_DATA_DIR/geography/boundaries/approved" --apply --run-id <batch-id> --retry-errors
```

回滚是独立显式操作：停止全部同步/生成写入器，核对备份 `quick_check`/哈希和批次，保存恢复前数据库副本，将一致备份替换主档并处理旧 sidecar，然后只读核对活动数及最新时间。必须说明这会同时回退备份后的新同步数据；不能边跑同步边替换文件。只需撤回展示时优先重新部署旧公开资产，无需回退私有事实。

### 6. 公开契约采用字段白名单

`Generator.load()` 从私有摘要附加可选 `geography`，在任何室内路线借用和公开裁剪之前读取计算来源；附加后不改变地图路线流程。`ACTIVITY_KEYS` 仍描述基础事实，新结构用独立 exporter 白名单创建，避免 ORM/private JSON 自动透传。

拟议 v1 合成示例（名称/数字为 fixture）：

```json
{
  "schemaVersion": 1,
  "status": "partial",
  "source": "private_route",
  "versions": { "catalog": "fixture-v1", "boundaries": "fixture-v1", "rules": "v1" },
  "provider": { "countryId": "country:CHN", "provinceId": "CHN:province:440000", "cityId": "CHN:city:440300", "source": "catalog_inferred" },
  "primary": { "countryId": "country:CHN", "provinceId": "CHN:province:440000", "cityId": "CHN:city:440300" },
  "validGpsDistanceM": 20000,
  "levels": {
    "country": { "status": "complete", "trustedDistanceM": 20000, "uncertainDistanceM": 0, "uncoveredDistanceM": 0, "reasons": [] },
    "province": { "status": "complete", "trustedDistanceM": 20000, "uncertainDistanceM": 0, "uncoveredDistanceM": 0, "reasons": [] },
    "city": { "status": "partial", "trustedDistanceM": 19900, "uncertainDistanceM": 100, "uncoveredDistanceM": 0, "reasons": ["near_boundary"] }
  },
  "regions": [
    { "id": "country:CHN", "level": "country", "name": "中国", "parentId": null, "distanceM": 20000 },
    { "id": "CHN:province:440000", "level": "province", "name": "广东省", "parentId": "country:CHN", "distanceM": 20000 },
    { "id": "CHN:city:440300", "level": "city", "name": "深圳市", "parentId": "CHN:province:440000", "distanceM": 12000 },
    { "id": "CHN:city:441900", "level": "city", "name": "东莞市", "parentId": "CHN:province:440000", "distanceM": 7900 }
  ]
}
```

`regions` 排序按层级/ID，与访问顺序无关；只包含可信正距离。规范 provider 的目录描述通过同一公开小型 catalog 获取，不依赖它也存在于经过地区数组。缺省 ID 为 null；失败状态不带旧 primary/regions。公开 `versions` 是可读包版本，不含路线哈希/路径。公开 details 仍 location-free。禁止坐标、来源文件、账号、进入/离开时间、私有指纹和原响应。

TS `src/core/types.ts` 定义对称 interface/union，Classic 兼容类型引用共享 Geography；新增 `src/core/activityGeography.ts` 从 `unknown` 验证结构/守恒/ID 与父级，局部无效只抛弃 geography。Python/TUI 用同一 fixture 验证约束。新字段缺失走旧兼容解析，不转换为轨迹证据。

### 7. 共享聚合与过滤，不改变活动事实

将 `activityLocation.ts` 中平台解析和 `activityGeography.ts` 中轨迹聚合分开，统一筛选参数 `{source: 'route' | 'provider', level, regionId}`。先按年/运动类型选择活动，再按所选来源匹配；route 模式对任何可信关联命中一次，统计仅累加该层该地区距离。活动行继续显示平台总距离，地区里程明确是“地区内 GPS 里程”。

Classic 地区列表/首页筛选、Dashboard ProfileCard/ChinaMap、省级联动、共享详情均用这些纯函数；TUI 实现相同契约而非复用 TS 代码。TUI `city:province` 老数据解析也与 fixture 校准。默认有可信结果时选 route，否则保留 provider 可用并提示轨迹覆盖不足；两种模式可手动切换且不得混算。

地图仍显示整条既有公开路线，不提供私有地区内线段。详情展示主链、无访问顺序的经过地区及覆盖原因，说明完整路线汇总和裁剪地图的差别。不新增精确地理请求。控件遵守已有样式/i18n，覆盖键盘、移动、亮暗和 reduced-motion。

## Risks / Trade-offs

- [真实中国市级包尚未通过验收] → 首阶段固定准入报告；未就绪显示明确状态，实际省市上线不能计为完成。
- [边界和 GPS 精度有限，保守缓冲会漏计真实短暂跨界] → 保留不确定里程、原因和规则版本，阈值可基于证据重算，不宣称绝对准确。
- [完整私有路线汇总会透露粗粒度经过地区] → 公开不含顺序/时间/坐标，发布审计地区汇总变化；仍遵循现有 500 m 与短路线规则，不借此宣称完全匿名。
- [原 polyline 无时间/分段，无法识别所有断点] → 优先有来源证明的原始文件，注明来源限制；明显跳点排除，不凭空恢复缺失路线。
- [全球相邻边界不一致与争议范围] → 记录每包范围/版本，重叠归为不确定，覆盖缺口如实报告，不以名称猜测归属。
- [几何计算增加同步时长] → 每层 STRtree 常驻、活动增量和指纹跳过；记录合成批次耗时/峰值内存，不预先承诺真实 1004 条耗时。
- [SQLite 预览/备份与并发写入冲突] → 预览拒绝未稳定主档，apply 共用锁并先备份；合成 WAL/中断测试验证，不对真实主档做破坏试验。
- [混用平台公里与 GPS 米] → 边界服务只输出米，共享转换及守恒测试，UI 始终注明统计来源。

## Migration Plan

1. 源码阶段：以临时 SQLite、合成路线/边界完成 schema、算法、CLI、增量/导出和所有消费者；保持真实主档及公开资产不变。两主题构建与浏览器验证分别记录。
2. 边界阶段：固定国家包及中国省市包的许可、CRS、编码和质量报告。未通过的层级不激活；这项外部前提与源码完成分别报告。
3. 真实试点（另行授权数据操作）：停止写入器，只读检查原活动数、最新时间、运动类型、原字段/路线校验值；小范围 dry-run，审阅覆盖/异常和原输入来源。apply 先备份，再迁移/回填少量指定 ID，检查事实不变、关联唯一、层级守恒。
4. 历史扩展（授权范围内）：按批次回填、续跑和审计全部结果；无路线/室内保留平台信息，边界不足不能冒充全量完成。日常脚本在已迁移 DB 上增量计算。
5. 公开发布（独立操作）：使用既有受保护生成流程，审计数据库/JSON 活动数、时间/类型/ID 一致性、公开字段白名单、端点裁剪/短路线回归、地区汇总、轨迹及 SVG diff。构建完成后按用户授权提交/发布；不恢复暂停的同步 workflow。
6. 回退：公开资产可独立回退；私有 schema/回填按第 5 节备份恢复并报告后续同步数据回退风险。不在运行中自动恢复。
