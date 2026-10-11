# 地区回填与恢复

地区计算基于完整私有真实路线，公开地图仍遵循每端 500 米裁剪和短路线保留规则。新增汇总不包含坐标、经过顺序、时间、文件路径或指纹。历史 JoyRun 请求 `wgs=1` 尚无独立控制点证据，因此保守返回 `unknown_crs`，任务 3.2 待验证。

## 维护窗口与预览

停止 JoyRun 同步、详情补齐以及其他数据库/轨迹写入器。设置既有仓库外 `RUNNING_DATA_DIR`，不要指向仓库内历史数据库。默认预览绕过 Generator 和 init_db，使用 immutable/query_only 连接，不生成 JSON/SVG，不下载边界，不访问运动平台。

```bash
.venv/bin/python run_page/geography_backfill.py --dry-run --limit 20
.venv/bin/python run_page/geography_backfill.py --dry-run --id 123 --status pending
```

非空 WAL/回滚日志、源文件变化或数据库/sidecar 变化使预览不可用；工具不会 checkpoint 或恢复这些文件。先解决正在写入的进程，再重新预览。

## 显式写入

以下命令仅用于已获得数据操作授权的范围。目录必须由当前用户所有、权限 700，DB 必须 600；工具与两个 JoyRun CLI 共用 `.running-data.lock`，并取得 SQLite 写入锁。先用 SQLite backup API 生成一致性备份与 SHA-256/quick_check 元数据，再安装 v1 schema；原 Activity、路线及原响应表不迁移或改写。

```bash
.venv/bin/python run_page/geography_backfill.py --apply --id 123
.venv/bin/python run_page/geography_backfill.py --apply --run-id BATCH_ID --retry-errors
.venv/bin/python run_page/geography_backfill.py --apply --run-id BATCH_ID --limit 50
.venv/bin/python run_page/geography_backfill.py --apply --id 123 --force
```

`--retry-errors` 只处理当前错误项；未变成功项自动跳过。`--force` 重算仍先备份。续跑要求相同版本；每活动摘要、关系和进度在事务中保存，失败可重试。报告仅含批次 ID、计数和状态；备份引用和指纹仅保存在私有 DB/元数据。

`--boundaries` 必须指向已验收并激活的包，见 [边界说明](geography-boundaries.md)。没有边界时允许显式迁移，平台归属仍可用，不能将不可用路线结果报告为真实覆盖完成。合成包必须显式 `--allow-synthetic`，不得用于真实主档。

## 日常增量和导出

未迁移 DB 保持原导出，增量报告 `not_migrated`，不隐式安装 schema。迁移后 JoyRun 基础活动/详情保存，再计算新增、缺失、变化和错误结果；失败保留已保存的平台事实。目录、边界、规则、真实路线/CRS、室内输入或原始详情变化会失效；公开裁剪/SVG 设置不触发计算。`--export-only`/既有数据库导出只读取当前结果，不回填。

`joyrunSync.sh` 仍只运行既有认证和同步入口，不下载边界或全量回填。无 CRS 证据时输出 `unknown_crs`，这是未验证状态，不是 WGS84 成功证明。

## 显式恢复演练

恢复会同时回退备份之后的新同步记录。真实主档不能用于破坏性演练；自动测试在临时数据库完成以下步骤：

1. 停止所有数据库、GPX、生成器写入器并持有共用锁。
2. 从批次 `backup_json` 取备份及元数据，核对 SHA-256；只读执行 `PRAGMA quick_check`，必须为 `ok`。
3. 用 SQLite backup API 保留恢复前数据库副本，独立记录活动数、最新时间、类型分布和源字段/原响应校验值。
4. 关闭全部 DB 连接；确认无活跃 WAL/回滚事务后，将已验证备份复制到同目录临时文件、设为 600，再原子替换主档。只在这一维护窗口处理旧 sidecar，不在同步中删除。
5. 用 immutable 只读连接核对恢复后活动事实、原路线和原始详情与备份一致，检查活动数、最新时间、类型分布和 schema。
6. 保留恢复前副本、备份和批次元数据；确认回退的新记录范围后再恢复写入。

若只撤回网页展示，可回退已审核的公开部署资产，无需回退私有数据库。数据再生成、提交和发布均按另行授权的范围执行。
