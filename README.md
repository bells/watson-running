# Watson Running

Personal Running Platform

[简体中文](README-CN.md) · [Live site](https://run.watsonzhu.cn/) · [RunAgent](https://github.com/bells/run-agent)

Watson Running is Watson's personal running-data platform. It turns data from sports platforms and GPX/TCX/FIT files into a static React experience with maps, charts, statistics, streaks, and activity history.

The project became independent at [`v3.0-upstream-baseline`](https://github.com/bells/watson-running/tree/v3.0-upstream-baseline). It was originally based on [`yihong0618/running_page`](https://github.com/yihong0618/running_page); the original project, contributors, Git history, MIT License, and attribution remain part of this repository.

## Current capabilities

- Running dashboard and activity history
- Route maps and geographic statistics
- Running statistics, charts, personal bests, and week streaks
- Classic and Dashboard themes
- Multi-sport data import and synchronization through the existing Python pipeline
- Static deployment to GitHub Pages, Vercel, or a conventional web server
- Textual TUI for browsing local activity data

The production site currently uses the Classic theme. Features listed under the roadmap are plans, not shipped capabilities.

## Architecture

```text
Sports platforms / GPX / TCX / FIT
        -> Python sync and normalization
        -> SQLite and generated track assets
        -> activities.json and SVG assets
        -> React / TypeScript / Vite
        -> static deployment
```

This repository has no runtime application backend. Activity data is generated before the frontend build and shipped as static assets.

The future AI boundary is intentionally a separate service:

```text
watson-running
React / TypeScript / maps / charts / RunAgent UI
        |
        | REST / SSE
        v
run-agent
Java 21 / Spring Boot / Spring AI / agents / memory / RAG / MCP
```

See [RunAgent integration boundary](docs/run-agent-integration.md) for the planned responsibilities and constraints.

## Local development

Requirements:

- Node.js 20 or newer
- pnpm 8.9.0 through Corepack
- Python 3.12 or newer for the declared Python package and CI path

```bash
corepack enable
pnpm install
pnpm dev
```

Open <http://localhost:5173/>.

Non-mutating frontend verification:

```bash
pnpm run check
pnpm exec tsc --noEmit
pnpm exec eslint src --ext .ts,.tsx
pnpm run build
```

Python verification:

```bash
python3 -m compileall run_page
black . --check
ruff check .
```

`pnpm run lint` and `pnpm run ci` modify files. Review the working tree before using them. Data synchronization and regeneration commands can modify the database, tracks, JSON, and SVG assets; do not run them as ordinary build checks.

## Configuration and themes

Personal settings live in [`config.yml`](config.yml). The current site uses `theme_preset: classic`; `dashboard` is also built in.

Mapbox tokens included in client builds must be public tokens restricted by URL or domain. Never commit platform passwords, refresh tokens, Garmin secret strings, or private API credentials.

## Deployment

The production URL remains <https://run.watsonzhu.cn/>.

- GitHub Pages is built by [`.github/workflows/gh-pages.yml`](.github/workflows/gh-pages.yml).
- Scheduled data generation is orchestrated by [`.github/workflows/run_data_sync.yml`](.github/workflows/run_data_sync.yml).
- Repository Secrets are not transferred when Git history is pushed to another repository.
- `PATH_PREFIX` can be supplied as a GitHub repository variable. Use `/watson-running` for the GitHub project URL and `/` after the custom domain is attached.

The current workflow declares `RUN_TYPE: joyrun`, but it does not execute a JoyRun synchronization step. A successful scheduled workflow therefore must not be interpreted as proof that new JoyRun activities were downloaded.

See [repository independence and operations](docs/repository-independence.md) for remote roles, branch policy, deployment migration, and required Secret names.

## Roadmap

| Area                                                                   | Status      |
| ---------------------------------------------------------------------- | ----------- |
| Personal running dashboard, maps, statistics, week streak, and history | Available   |
| Stable `watson-running` repository and deployment migration            | In progress |
| RunAgent v0.1 UI integration over REST / SSE                           | Planned     |
| Natural-language running-data queries                                  | Planned     |
| AI running analysis and training insights                              | Planned     |
| Runner profile and durable agent memory                                | Planned     |
| Tool calling, RAG, MCP, and evaluation                                 | Planned     |

The Java service remains in [`bells/run-agent`](https://github.com/bells/run-agent). It will not be merged into this frontend and data-pipeline repository.

## Repository history

- Current repository: [`bells/watson-running`](https://github.com/bells/watson-running)
- Historical repository from the pre-independence maintenance period: [`bells/running_page`](https://github.com/bells/running_page)
- Original project: [`yihong0618/running_page`](https://github.com/yihong0618/running_page)
- Independence baseline: [`v3.0-upstream-baseline`](https://github.com/bells/watson-running/tree/v3.0-upstream-baseline)
- Original English usage guide at the baseline: [README.md](https://github.com/bells/watson-running/blob/v3.0-upstream-baseline/README.md)
- Original Chinese usage guide at the baseline: [README-CN.md](https://github.com/bells/watson-running/blob/v3.0-upstream-baseline/README-CN.md)

The `upstream` Git remote is reference-only. Do not merge `upstream/master` directly without an explicit, reviewed change.

## Acknowledgements

This project was originally based on [`yihong0618/running_page`](https://github.com/yihong0618/running_page).

Thanks to Yi Hong and all original and subsequent contributors for the data pipeline, visualization work, integrations, documentation, and community that made this project possible.

## License

This repository retains the original [MIT License](LICENSE) and copyright notice. Git history records both the original work and Watson's later changes.
