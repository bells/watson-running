# 离线边界包验收与激活

入口为 `python -m run_page.geography.boundaries <目录>`，默认只读验收。
它不导入 `Generator`、`init_db`，不下载、不接触活动主档，也不生成运动 JSON/SVG。
`--activate` 只向仓库外边界包目录写 `accepted.json`；运行服务必须使用
`load_active_package()`，重新验收文件并核对该标记。修改任何文件或 manifest
后需重新验收，旧标记不再有效。此入口不是地理回填工具。

真实包放在 `RUNNING_DATA_DIR/geography/boundaries/<package-id>/`，
固定版本，禁止日常同步自动下载或追踪 `main`/`latest`。
公开 Git 仅保存源码与明确标为 synthetic 的合成包。

## 规范包制作

1. 获取固定提交/发布的源文件及每文件上游**数据**许可，保存许可证文本、URL、
   归属声明和获取日期。仓库代码许可不替代数据再分发权；人工核对是上线前提。
2. 检查来源真实 CRS、轴顺序、控制点和实际行政层级。转换到 WGS84，输出轴顺序
   longitude/latitude（`OGC:CRS84`），记录源 CRS 与转换步骤；未知 CRS 不尝试转换。
3. 将单位映射到版本化目录中的稳定 ID。输出 FeatureCollection，每 Feature 为
   Polygon/MultiPolygon，properties 为 `region_id`、`parent_id`。不保留路线、账号或
   原平台响应。省/市首期只接受 CHN；`city` 的实际语义必须为地级 `prefecture`。
4. 保留洞与多岛；反经线几何拆成 ±180° 窗口，任何环相邻经度差不能超过 180°。
   不在 loader 中静默 `make_valid`；源数据修复需新版本与修复报告。
5. 制作 `manifest.json`，逐文件固定 SHA-256；声明精确 regionIds、覆盖 Polygon/
   MultiPolygon、knownGaps、knownOverlaps（稳定 ID 对，按 ID 排序）、knownDisputes。
   同层重叠必须明确声明，后续计算视为不确定；不因声明重叠而视为可信。
6. 同包省/市必须包含父级边界。严格包含通过；30 m 内的小误差记录为
   `parentToleranceRegions`，后续求交须将父子差集记为不确定；超过 30 m 拒绝。
   该阈值固定在 `boundary-acceptance-v1`，不是可随意调整的 manifest 参数。
7. 在指定目录运行验收。人工复核许可、层级、CRS、缺失/争议清单及控制点后，
   再对获授权真实包执行 `--activate`。通过国家层而缺省/市时，明确返回
   `unavailableLevels`，不能宣称全层级覆盖。

完整可运行 manifest 示例是
[`tests/fixtures/geography-boundaries/manifest.json`](../tests/fixtures/geography-boundaries/manifest.json)。
每层必填来源、许可、CRS/控制点、行政语义、文件哈希及覆盖字段。
fixture 的坐标与许可证仅用于合成数据，不能当作真实行政界线或 JoyRun CRS 证据。
验收报告只包含版本、地区 ID、计数和缺口/重叠状态，不输出几何或路线坐标。

## 可重复的合成演练

用临时目录复制包，确保不向版本控制的 fixture 写激活标记：

```bash
fixture_dir=$(mktemp -d)
cp -R tests/fixtures/geography-boundaries "$fixture_dir/package"
python -m run_page.geography.boundaries "$fixture_dir/package" \
  --catalog "$fixture_dir/package/catalog.json" --allow-synthetic --activate
python -m unittest discover -s tests -p test_geography_boundaries.py
```

测试包含 CLI 成功激活与县级坏包拒绝；以及坏哈希、无许可、未知 CRS、
未声明重叠/缺口、错误父级、未知编码、自交几何、未拆反经线和激活后修改。
合成包包括相邻国家/省/市、洞、多岛、缺口、重叠；STRtree 候选不遗漏真实相交单位。
所有拒绝测试核对包文件不变，不创建 DB。合成包默认拒绝，必须显式允许。

## 候选与真实上线边界

设计阶段调查结论来自
[`design.md`](../openspec/changes/derive-activity-regions-from-routes/design.md)，
尚未构成真实包验收：

- [geoBoundaries gbOpen](https://github.com/wmgeolab/geoBoundaries)：全球 ADM0 候选。
  须逐包固定文件/提交、上游许可、ISO 映射、年份、覆盖和争议报告。
  CHN ADM2 元数据为 County Level，不能当作地级市；CHN ADM1 的年份/精度也需另核对。
- [ChinaAdminDivisonSHP](https://github.com/GaryBikini/ChinaAdminDivisonSHP)：市级 adcode
  候选，但 README 声明名义 WGS84 实为 GCJ-02，来源高德；MIT 仓库许可不证明
  上游数据权利。未解决实际 CRS 与数据许可前不激活。
- `src/assets/china-provinces.json` 继续是展示地图，不能直接作为计算边界。

当前没有通过本入口验收的真实全球/中国包，不代表地区能力已上线。
真实边界获取验收、真实主档试点/回填和公开资产发布对应任务第 9 组，分别记录证据。
