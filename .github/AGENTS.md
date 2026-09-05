# GitHub 自动化协作指南

适用于 `.github/` 及所有子目录，补充[根级指南](../AGENTS.md)。修改前阅读目标 Workflow 和它实际调用的脚本。

## 工作流职责

| 文件 | 行为与验证边界 |
| --- | --- |
| `workflows/ci.yml` | Python 3.12–3.14 与 Node 20/22/24 矩阵；Python 执行 GPX 同步，Node 执行带 `--fix` 的 lint，不是全部只读检查。 |
| `workflows/run_data_sync.yml` | 同步、生成、缓存或提交运动资产，随后按配置调用 Pages；可能写入远程分支。 |
| `workflows/gh-pages.yml` | checkout 仓库默认分支，构建 `dist/` 并发布 Pages；不能假设手动触发时会部署所选功能分支。 |
| `dependabot.yml` | 分别维护 GitHub Actions、npm、pip 和 uv 更新；合并一个生态的依赖 PR 不代表其他入口同步更新。 |

## 修改要求

- 修改同步工作流前核实当前分支、remote、最新相关 Actions 运行及预期数据源，避免覆盖自动生成提交。远程状态不可访问时明确记录，不把本地 YAML 当作运行证据。
- `RUN_TYPE: joyrun` 目前没有匹配的同步 step；只有生成成功不能证明抓取了新活动。修复时核实适配器和必要 Secret 名称，不打印 Secret 值。
- `SAVE_DATA_IN_GITHUB_CACHE=false` 会执行 `git add .`、提交并推送 `HEAD:${GITHUB_REF_NAME}`；审查所有前置步骤是否写入意外文件，保留数据资产的完整性。
- `SAVE_DATA_IN_GITHUB_CACHE` 的变化会影响持久化，需同时检查同步端和 Pages 端的缓存目录、key、restore-keys 与调用参数。
- Pages 的 `PATH_PREFIX` 未设置时回退到仓库路径，自定义域名需要 `/`。路由/部署改动检查 `vite.config.ts`、Classic basename、静态资源和 `/summary`。
- 调整 Node、Python 或包管理器版本时检查 CI、Pages、同步、Docker 和依赖声明；不要用单个本地构建证明全部矩阵兼容。
- 保留最小权限、部署 concurrency 和 Secret 的受控传递。修改 Workflow 文件不等于获准触发远程数据同步或部署，执行这些操作需符合用户任务范围。

## 验证与交付

- 至少执行 `git diff --check`，并检查 YAML 结构、表达式、触发条件、权限、缓存与提交目标；环境有 `actionlint` 时运行 `actionlint`。
- 对引用的脚本执行对应的安全检查。数据生成使用隔离 fixture；不要为了验证 Workflow 而清理个人数据或触发全量同步。
- 报告本地检查与实际 GitHub Actions 运行结果的区别。Secrets、Pages、域名和 Vercel 是外部状态，未实际核实时不能写成迁移完成。
