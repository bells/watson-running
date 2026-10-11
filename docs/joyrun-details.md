# JoyRun activity details

The JoyRun backfill reads `userRunList.aspx` and `Run/GetInfo.aspx`. The list
provides the activity ID, device source and calorie value. The detail response
provides cumulative kilometre nodes, step samples, heart rate, altitude,
pauses, and the original route. The private `joyrun_details` table in
`RUNNING_DATA_DIR/data.db` saves each list item and `runrecord` response so a
later RunAgent importer can revisit fields without another platform request.
The script deliberately excludes the response's session ID.

The public site contains a location-free subset:

- `src/static/activities.json` has optional `source`, `detail_available`,
  `calories_kcal`, `total_steps`, `average_cadence_spm`, and
  `average_stride_m` summary fields. Existing activity IDs and units remain.
- `public/activity-details/<run_id>.json` contains splits and timed heart
  rate, altitude, steps, cadence, and estimated stride samples. The small
  `public/activity-details/index.json` lists exported IDs. All URLs respect
  Vite's `BASE_URL`.

The private response also contains `content`, `nodeattach`, account IDs, and
other source fields. These are never copied to the public detail JSON. They
may include precise location and must stay outside the public checkout. A
RunAgent import should consume a reviewed read-only export rather than open
the private database or pass raw responses to an AI model.

`node` records cumulative distance and moving time, so consecutive entries
form each kilometre split. The first element of each `stepcontent` sample is
the step count. The second element approximately sums to activity distance;
the displayed stride is therefore labelled an estimate. The average stride
uses total distance divided by total steps. Source calorie values are divided
by 1000 to display kcal. Missing heart rate or altitude samples remain empty
at their original time index. Some older activities have no such samples.

日常同步直接执行仓库根目录的脚本：

```bash
./joyrunSync.sh
```

脚本可从任意目录启动，使用 `.venv/bin/python`，提示输入手机号，再由
Python 隐藏输入短信验证码。无需手动激活虚拟环境；手机号和验证码不会
硬编码在脚本中，验证码不会出现在命令行参数中。可通过 `JOYRUN_PHONE`、
`JOYRUN_ATHLETE`、`JOYRUN_PYTHON` 配置账号、展示名称与解释器。
`RUNNING_DATA_DIR` 默认指向 `$HOME/work/watson-running-data`，可自行覆盖。
脚本默认 `IGNORE_START_END_RANGE=500` 并正确清除 `IGNORE_BEFORE_SAVING`；
不是 `IGNORE_BEFORE_SAVIN`。短轨迹仍沿用原有展示策略。

普通 `joyrun_sync.py` 同步会复用活动详情响应，保存私有详情，再自动补齐
主档中已有活动的缺失详情，最后导出脱敏详情、活动 JSON 和 SVG。
已有详情不会重复下载；补齐缺失详情时会重试三次，保留已成功的活动，并以非零状态退出，
下次执行继续补齐。之前已同步的最新四条活动也会在下一次同步时自动补详情。
一轮只需登录一次；新增活动的详情不会重复请求。

也可以直接运行安全的交互入口（旧位置参数方式仍兼容）：

```bash
.venv/bin/python run_page/joyrun_sync.py --phone <phone> --with-gpx --athlete watson
```

国家、省份、城市的别名在前端共享解析层统一，如 `China` / `中国`、
`广东` / `广东省`、`深圳` / `深圳市`。统计和城市筛选使用相同的规范名称；
直辖市按城市汇总，不按城区重复计数。不同国家或省份的同名城市保留独立统计。
这些展示修复无需修改历史数据库或手工编辑生成 JSON。

To resume a backfill, set `RUNNING_DATA_DIR` and
`IGNORE_START_END_RANGE=500` for the current published route policy, then run:

```bash
.venv/bin/python run_page/joyrun_detail_sync.py --phone <phone>
```

The script prompts for an SMS code without echoing it, skips saved IDs, commits
each activity, retries temporary failures, and reports failures for another
run. It does not generate GPX or SVG. To rebuild public files from an already
populated private database:

```bash
.venv/bin/python run_page/joyrun_detail_sync.py --export-only --refresh-activities-json
```

Review the generated files before publishing. The old `activities.json`
consumer remains compatible; RunAgent v0.2 will see the new summary fields
when it reloads that file, but it does not yet consume per-activity detail
files.

## 地区汇总增量

地区 schema 必须先通过独立维护窗口、备份和显式迁移安装，见
[地区回填与恢复](geography-backfill.md)。`joyrunSync.sh` 不执行全量回填或下载边界；
未迁移 DB 提示 `not_migrated`，继续原同步/导出。迁移后基础活动及详情先保存，
再增量计算地区，单条地理错误可重试且不丢平台事实。详情补齐也在保存后增量计算，
`--export-only` 仅导出现有结果。

历史 JoyRun CRS 暂保守标记 `unknown_crs`；`wgs=1` 参数不是独立控制点验证。
公开详情保持 location-free，地区汇总只在活动 JSON 的可选 `geography` 内，
stale/error 不发布旧经过地区。真实边界验收、主档回填和公开再生成仍需独立范围。
