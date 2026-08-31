# Watson Running

个人运动数据平台

[English](README.md) · [线上站点](https://run.watsonzhu.cn/) · [RunAgent](https://github.com/bells/run-agent)

Watson Running 是 Watson 的个人运动数据平台。它将运动平台以及 GPX/TCX/FIT 文件中的数据处理为静态 React 站点，提供地图、图表、统计、连续运动记录和活动历史。

项目从 [`v3.0-upstream-baseline`](https://github.com/bells/watson-running/tree/v3.0-upstream-baseline) 开始独立演进。本项目最初基于 [`yihong0618/running_page`](https://github.com/yihong0618/running_page)；原项目、贡献者、完整 Git 历史、MIT License 和来源说明都继续保留。

## 当前能力

- 个人运动 Dashboard 与活动历史
- 轨迹地图和地域统计
- 跑步统计、图表、个人最佳和 Week Streak
- Classic 与 Dashboard 两套主题
- 复用现有 Python Pipeline 的多运动类型导入与同步
- 部署到 GitHub Pages、Vercel 或常规静态 Web Server
- 使用 Textual TUI 在本地浏览活动数据

生产站点当前使用 Classic 主题。Roadmap 中标记为 Planned 的内容尚未实现。

## 架构

```text
运动平台 / GPX / TCX / FIT
        -> Python 同步与归一化
        -> SQLite 与生成的轨迹资产
        -> activities.json 与 SVG
        -> React / TypeScript / Vite
        -> 静态部署
```

本仓库没有运行时业务后端。活动数据在前端构建之前生成，并作为静态资源发布。

未来的 AI 能力保持为独立服务：

```text
watson-running
React / TypeScript / 地图 / 图表 / RunAgent UI
        |
        | REST / SSE
        v
run-agent
Java 21 / Spring Boot / Spring AI / Agent / Memory / RAG / MCP
```

职责与约束见 [RunAgent 集成边界](docs/run-agent-integration.md)。

## 本地开发

环境要求：

- Node.js 20 或更高版本
- 通过 Corepack 使用 pnpm 8.9.0
- 项目声明及 Python CI 路径使用 Python 3.12 或更高版本

```bash
corepack enable
pnpm install
pnpm dev
```

访问 <http://localhost:5173/>。

不会自动修改源码的前端检查：

```bash
pnpm run check
pnpm exec tsc --noEmit
pnpm exec eslint src --ext .ts,.tsx
pnpm run build
```

Python 检查：

```bash
python3 -m compileall run_page
black . --check
ruff check .
```

`pnpm run lint` 和 `pnpm run ci` 会修改文件，使用前后都要审计工作树。数据同步和重新生成命令可能修改数据库、轨迹、JSON 和 SVG，不能把它们当成普通构建检查运行。

## 配置与主题

个性化配置位于 [`config.yml`](config.yml)。当前站点使用 `theme_preset: classic`，同时内置 `dashboard`。

进入客户端构建的 Mapbox token 只能使用受 URL 或域名限制的公开 token。不要提交平台密码、refresh token、Garmin secret string 或私有 API 凭据。

## 部署

生产地址继续使用 <https://run.watsonzhu.cn/>。

- GitHub Pages 由 [`.github/workflows/gh-pages.yml`](.github/workflows/gh-pages.yml) 构建。
- 定时数据生成由 [`.github/workflows/run_data_sync.yml`](.github/workflows/run_data_sync.yml) 编排。
- 仅推送 Git 历史不会把 Repository Secrets 复制到新仓库。
- 可以通过 GitHub Repository Variable 设置 `PATH_PREFIX`。GitHub Project Pages 使用 `/watson-running`，绑定自定义域名后使用 `/`。

当前 Workflow 声明了 `RUN_TYPE: joyrun`，但没有实际执行 JoyRun 同步脚本。因此定时任务成功不能证明已经下载新的悦跑圈活动。

远程仓库角色、分支策略、部署迁移和 Secret 名称见 [仓库独立化与运维说明](docs/repository-independence.md)。

## Roadmap

| 能力                                               | 状态        |
| -------------------------------------------------- | ----------- |
| 个人 Dashboard、地图、统计、Week Streak 和历史记录 | Available   |
| `watson-running` 仓库与部署稳定迁移                | In Progress |
| 基于 REST / SSE 的 RunAgent v0.1 UI                | Planned     |
| 自然语言查询运动数据                               | Planned     |
| AI 跑步分析与训练洞察                              | Planned     |
| Runner Profile 与持久化 Agent Memory               | Planned     |
| Tool Calling、RAG、MCP 与 Evaluation               | Planned     |

Java 服务继续位于 [`bells/run-agent`](https://github.com/bells/run-agent)，不会合并进当前前端与数据 Pipeline 仓库。

## 仓库历史

- 当前仓库：[`bells/watson-running`](https://github.com/bells/watson-running)
- 独立前维护阶段的历史仓库：[`bells/running_page`](https://github.com/bells/running_page)
- 最初项目：[`yihong0618/running_page`](https://github.com/yihong0618/running_page)
- 独立演进基线：[`v3.0-upstream-baseline`](https://github.com/bells/watson-running/tree/v3.0-upstream-baseline)
- Baseline 中的原英文使用文档：[README.md](https://github.com/bells/watson-running/blob/v3.0-upstream-baseline/README.md)
- Baseline 中的原中文使用文档：[README-CN.md](https://github.com/bells/watson-running/blob/v3.0-upstream-baseline/README-CN.md)

`upstream` Git remote 只用于历史参考。没有经过明确、独立的评审，不得直接合并 `upstream/master`。

## 致谢

本项目最初基于 [`yihong0618/running_page`](https://github.com/yihong0618/running_page)。

感谢 Yi Hong、原项目贡献者以及后续贡献者完成的数据 Pipeline、可视化、平台集成、文档与社区工作。

## License

仓库完整保留原始 [MIT License](LICENSE) 与版权声明。Git 历史同时记录原始工作和 Watson 后续的修改。
