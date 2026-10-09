# GitHub PR 与安全检查（2026-10-09）

本次基线为 `main` 的 `c9b6fe6f10a22212fb3b195d3a58da3fe54e06fd`。以下告警通过 GitHub API 实际读取，不把本地修复等同于默认分支告警关闭。

## 修复范围

| 来源 | 问题 | 处理 |
| --- | --- | --- |
| [PR #15](https://github.com/bells/watson-running/pull/15) | checkout v4 → v7 | 更新现有三个 Workflow；数据同步仍保持禁用，Pages 仍只按原触发方式执行 |
| [PR #16](https://github.com/bells/watson-running/pull/16) | OpenAI 3.6.0 → 3.24.0 只修改 pip 入口 | 同步 `requirements.txt`、`pyproject.toml`、uv 与 PDM 锁；两份锁仅升级 OpenAI 与 oauthlib |
| [PR #18](https://github.com/bells/watson-running/pull/18) | parser 单独升级 | parser 与 eslint-plugin 一起更新到 8.71.1，保留 TypeScript 6 |
| [PR #19](https://github.com/bells/watson-running/pull/19)、Dependabot #56 / #57 | oauthlib PKCE 时序比较与 JSONP 注入漏洞 | 两个安装入口声明 `oauthlib>=4.0.0,<5`，两份锁解析为 4.0.0 |
| CodeQL #9 / #10 | CI 未显式限制 GITHUB_TOKEN 权限 | Workflow 级 `permissions: contents: read`，保留 checkout 的 `persist-credentials: false` |
| 最新 pnpm audit | source-map-js 索引 source-map 偏移导致事件循环拒绝服务，[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | 传递依赖 1.2.1 → 1.2.2，无全局 override |

CI 补入依赖入口一致性测试，以及已有的生成器隐私、凭据输出和 JoyRun 详情隔离测试。入口测试检查 pip / project 的直接依赖声明、两份锁中的精确版本和 oauthlib 安全下限，避免单个 Dependabot PR 造成其他安装入口仍使用旧版本。

## JoyRun MD5：待决策的协议风险

[CodeQL #8](https://github.com/bells/watson-running/security/code-scanning/8) 指向 `run_page/joyrun_sync.py` 的 `get_md5_data()`。调用方 `JoyrunAuth.__get_signature()` 将请求参数、协议 salt、uid、sid 拼接，计算 JoyRun API 所需的 v1 / v2 签名，发送到 HTTPS 的 `api.thejoyrun.com`；它没有用于本地密码存储或密码验证。

此处包含会话标识，MD5 确实是弱算法，不能直接标成已修复或误报。客户端单独替换 SHA-256 会破坏第三方签名协议。保留告警，直到维护者明确决定接受该外部协议风险，或服务方提供更强协议。若接受，可按 `won't fix` 记录协议原因；不要用 `used in tests` 或隐藏扫描规则来关闭它。

## 验证与边界

- pnpm 12.6.0 冻结安装、Prettier、TypeScript、非修复型 ESLint、四套 Node 测试及 Vite 构建通过；修复后 `pnpm audit --json` 的 579 个依赖报告 0 个已知漏洞。ESLint 仍有 33 个 warning、0 error，涉及已有组件的 React purity、effects、依赖和 key，未在本次依赖修复中重构组件。
- Python 3.12.13 的依赖入口测试 3 项，私有路径 / 生成器 / TUI 测试 16 项，`tests/` 下安全与详情测试 8 项通过；Black、Ruff 和 compileall 通过。
- `uv lock --check --offline` 与 `pdm lock --check` 通过。OpenAI chat / image edit 使用 MockTransport 验证，OAuth1 签名与 OAuth2 请求构造使用合成凭据验证，没有向真实平台或模型服务发送请求。
- 不改动私有数据库、GPX、活动 JSON、详情 JSON 或 SVG；未执行同步、数据生成、Pages 手工部署或 Docker 构建。真实平台认证、浏览器地图及线上部署未验证。
- Secret scanning 在初始查询时没有开放告警。修复合入后仍需查询默认分支 CodeQL 与 Dependabot 状态；本地审计结果不能替代该步骤。
