# 参与 Watson Running

欢迎改进 Watson Running。项目基于 `yihong0618/running_page`，请保留原始 MIT License、贡献者 attribution 和 Git 历史。

## 开始前

1. 阅读 [AGENTS.md](AGENTS.md) 及目标目录的补充指南：[前端](src/AGENTS.md)、[Python](run_page/AGENTS.md)、[自动化](.github/AGENTS.md)。
2. 检查 `git status --short`、`git branch --show-current` 和 `git remote -v`，保留已有改动。新工作分支建议使用 `codex/` 前缀。
3. 明确变更与验证范围。主题扩展参见 [主题文档](docs/theme-system.md)，部署参见 [运维说明](docs/repository-independence.md)，对应后端 `bells/run-agent` 的职责及接入规划参见 [RunAgent 边界](docs/run-agent-integration.md)。

## 本地准备

前端建议使用 Node 24，并通过 Corepack 使用 `package.json` 指定的 pnpm 版本（当前 8.9.0）：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Python 本地使用 `.python-version` 指定的 3.12，在独立虚拟环境内安装所需依赖。具体安装入口和不同运行路径的版本差异见 [Python 指南](run_page/AGENTS.md)。纯文档工作无需安装应用依赖。

## 提交前验证

| 变更 | 最低检查 |
| --- | --- |
| 文档 | `git diff --check`，核实链接、路径和命令与现状一致 |
| 前端 | `pnpm run check`、`pnpm exec tsc --noEmit`、`pnpm exec eslint src --ext .ts,.tsx`、`pnpm run build` |
| Python | `python3 -m compileall run_page`、`black . --check`、`ruff check .`，以及目标模块的隔离测试 |
| TUI | Python 检查，加 `python3 -m unittest test_tui_app` |
| Workflow | diff/YAML 检查，有工具时运行 `actionlint`，再检查所调用脚本及目标环境 |

筛选、统计、地图、主题、动画和数据生成改动应补充针对性测试。共享层改动需要两套主题构建，路由改动需要根路径与仓库子路径验证。真实浏览器、地图服务或部署未验证时，应在交付中明确说明。

`pnpm run lint` 和 `pnpm run ci` 会自动改文件，运行后审计 diff。`data:clean`、下载、同步和 SVG 生成属于数据操作，不是初始化或普通检查；未经任务明确要求，不运行它们。

## 交付

- 说明问题、最终行为、验证结果与剩余限制；将手写源码和数据库/轨迹/JSON/SVG 的变化分开描述。
- 只暂存本任务文件，检查 `git diff --check` 和 staged diff，避免夹带凭据、个人轨迹或 `.codegraph/`。
- 用户要求“提交代码”时创建本地提交并报告 hash；推送、部署、Tag 和旧仓库归档按明确授权范围执行。
