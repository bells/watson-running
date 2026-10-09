# 公开活动展示语义

核对位置：Python `run_page/generator/db.py` 的 `Activity`/`ACTIVITY_KEYS`、`run_page/generator/__init__.py` 的 JSON 导出、`src/core/types.ts`、`src/themes/classic/utils/utils.ts` 和 `run_page/tui/data.py`。展示纯函数在 `src/core/activityDisplay.ts`，使用合成记录测试。

| 字段 | 来源单位/形状 | 界面规则 |
| --- | --- | --- |
| `distance` | 米 | 转公里；真实 0 可显示为 0.0，缺失/非有限值显示 `—` |
| `average_speed` | 米/秒 | 每公里配速用 `1000 / speed` 秒，四舍五入后拆分分秒；0/缺失显示 `—` |
| `moving_time` | `H:MM:SS` 或 `X days, H:MM:SS` | 解析成秒，再显示时长；不可解析显示 `—` |
| `start_date_local` | 本地 `YYYY-MM-DD HH:MM:SS` | 年份取前四位；记录按本地时间降序，同刻以 `run_id` 降序稳定排序 |
| `type` | 运动类型英文代码 | 中文界面给已知类型清楚的名称；未知类型保留原值，不改写来源 |
| `summary_polyline` | 已公开裁剪的路线或空 | 空值说明无公开路线；不从其他字段恢复轨迹 |
| `average_heartrate` | bpm，可为空 | 缺失显示 `—`；0 不被当作缺失值 |

单次详情的 `distance_m`、`moving_seconds` 与平均配速共用同一计算语义；分段与曲线仍使用公开明细中的原始/估算字段。静态数据没有新增字段，本次没有改动数据库、真实 JSON 或轨迹。
