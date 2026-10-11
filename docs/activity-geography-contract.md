# Activity geography v1

本能力保留平台事实与 `location_country` 原文。`run_page/geography/region_catalog.json`
是 Python/TypeScript 共用的身份与别名目录，不是行政边界或真实覆盖证明。
目前国家别名沿用已有地点解析支持范围，全球边界阶段需补齐经核对的 ISO 映射。
省市编码来自已有 `locationNames.ts`，使用前仍需与通过验收的真实边界核对。
直辖市及无地级层的单位使用显式一对一市级映射（`equivalent: true`）；
旧目录中的 `xx9000` 县级集合不作为一个地级市发布。

地区主键与名称分离：国家为 `country:<ISO alpha-3>`，中国省、市为
`CHN:province:<adcode>` / `CHN:city:<adcode>`。父级严格为国家→省→市；
别名在父级内匹配，歧义返回未知，不任选第一个候选。
规范平台链的 `source` 为 `provider`（显式国家）、`catalog_inferred`
（唯一目录链推导）或 `null`（无法识别），不构成轨迹证据。

合成共享契约在 `tests/fixtures/geography-contract.json`：包括深圳别名、
直辖市/同级地区、异父级同名、未知国家与来源冲突。它不包含真实路线。

## 状态与距离

总体状态：`pending` 未计算、`complete` 完整、`partial` 部分、`no_route` 无路线、
`indoor` 室内、`invalid_route` 无效路线、`unknown_crs` 坐标系未确认、
`boundary_unavailable` 边界未就绪、`stale` 输入已变化、`error` 计算失败。
层级状态为 `complete` / `partial` / `boundary_unavailable` / `out_of_scope` /
`unavailable`；海外省市属于 `out_of_scope`，不能用已计算的零值表示。

所有新增距离以米表示，必须有限且非负。`null` 表示未知或不能计算，`0`
表示可测量且确实为零。可信地区关联只包含正里程。同层可信、不确定、未覆盖
长度的和等于有效 GPS 长度，容差为 `max(1 m, 有效长度 × 0.0001)`；
国家、省、市三层不能相加。平台距离不变，不按它缩放 GPS 地区里程。

稳定原因码列在 fixture 的 `contract.reasons`：来源/输入问题使用
`source_conflict`、`no_route`、`indoor`、`invalid_coordinate`、`unknown_crs`；
断段诊断使用 `segment_break`、`time_reversal`、`jump_point`；覆盖问题使用
`projection_failed`、`near_boundary`、`brief_crossing`、`overlap`、`coverage_gap`、
`parent_conflict`、`boundary_unavailable`、`out_of_scope`；生命周期使用
`input_changed`、`not_migrated`、`calculation_error`。平台解析的未知/歧义诊断为
`unknown_provider`、`ambiguous_provider`。原因不是坐标或原始异常字符串。

公开 v1 只允许版本、来源、平台规范链、主地点链、每层覆盖摘要和无顺序地区里程。
失败/失效状态不能携带旧轨迹关联。不发布路线指纹、文件路径、坐标、过境顺序/时间、
账号或原响应。地图仍遵循既有每端 500 m 裁剪与短路线保留规则。

## 离线契约验证

```bash
python -m unittest discover -s tests -p test_geography_catalog.py
node --test tests/geography-catalog.test.mjs tests/activity-location.test.mjs
```

测试直接导入纯目录模块，不初始化数据库，不访问运动平台，不生成运动资产。
