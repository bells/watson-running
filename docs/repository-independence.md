# Repository independence and operations

## Identity

- Project: Watson Running
- Repository: <https://github.com/bells/watson-running>
- Production URL: <https://run.watsonzhu.cn/>
- Independence baseline: `v3.0-upstream-baseline`
- Baseline commit: `2f788c2d7fb45ee5b754a2d29290194e8df23ed5`

The baseline preserves the complete history synchronized from `yihong0618/running_page` before Watson Running began independent development.

## Git remotes

| Remote     | URL                                              | Purpose                                                                      |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `origin`   | `git@github.com:bells/watson-running.git`        | Current project and normal push target                                       |
| `legacy`   | `git@github.com:bells/running_page.git`          | Historical maintained-fork repository; keep until migration is proven stable |
| `upstream` | `https://github.com/yihong0618/running_page.git` | Reference only                                                               |

Do not merge `upstream/master` directly. Any future upstream change must be selected deliberately, reviewed as an independent change, and verified against Watson's data, privacy, themes, and deployment.

## Branch policy

`main` is the default branch for Watson Running. The migrated `master` branch remains as the exact initial repository baseline until the new deployment is stable; deleting it is a separate, explicitly approved cleanup.

Workflows must follow the repository default branch or the checked-out branch rather than assuming `master`.

## GitHub Pages path

The Pages workflow accepts a repository variable named `PATH_PREFIX`:

- Leave it unset to use `/<repository-name>`, currently `/watson-running`.
- Set it to `/` after `run.watsonzhu.cn` is attached to this repository.

Moving the custom domain is an operational cutover. Verify the project-path deployment first, then attach the custom domain and change `PATH_PREFIX` together. Do not remove the domain from the old deployment before the new Pages build is healthy.

## Workflow Secrets

GitHub does not copy Repository Secrets when Git history moves. The workflows reference these names:

```text
COROS_ACCOUNT
COROS_PASSWORD
GARMIN_EMAIL
GARMIN_PASSWORD
GARMIN_SECRET_STRING
GARMIN_SECRET_STRING_CN
INTERVALS_ICU_API_KEY
INTERVALS_ICU_ATHLETE_ID
KEEP_MOBILE
KEEP_PASSWORD
MAPBOX_TOKEN
NIKE_REFRESH_TOKEN
OPPO_CLIENT_REFRESH_TOKEN
OPPO_CLIENT_SECRET
OPPO_ID
STRAVA_CLIENT_ID
STRAVA_CLIENT_REFRESH_TOKEN
STRAVA_CLIENT_SECRET
STRAVA_EMAIL
STRAVA_JWT
STRAVA_PASSWORD
TULIPSPORT_TOKEN
```

Only copy values through GitHub's Secret settings or an approved secret-management workflow. Never print values into logs or place them in files. Restrict public Mapbox tokens by the production and preview URLs.

The active `RUN_TYPE` determines which provider Secrets are needed at runtime. `MAPBOX_TOKEN` is consumed by CI and Pages builds. The current `joyrun` declaration has no matching sync step, so it does not currently fetch new activities.

The legacy repository currently has `JOYRUN_USER` and `JOYRUN_PASSWORD` configured, but no current Workflow expression references either name. Do not copy them merely to make a run appear configured; first implement and review an explicit JoyRun sync step, then add the credentials through GitHub's Secret settings.

## Deployment cutover checklist

1. Verify `main` CI in `bells/watson-running`.
2. Configure the required Repository Secrets without exposing their values.
3. Enable GitHub Pages with GitHub Actions as the source.
4. Deploy and verify the project URL with the default `/watson-running` path.
5. Confirm home, map, statistics, week streak, latest activity, `/summary`, static assets, and browser console.
6. Configure `PATH_PREFIX=/` and attach `run.watsonzhu.cn`.
7. Repeat the browser verification on the custom domain.
8. Observe at least one intended data workflow and confirm its commit target is `main`.
9. Keep `bells/running_page` unarchived until all checks remain stable.

Vercel projects, custom domains, environment variables, and GitHub Secrets are external configuration. They are not transferred by Git push and must be inspected independently.

## License and attribution

The original MIT License and copyright notice remain unchanged. Project documentation must continue to state that Watson Running was originally based on <https://github.com/yihong0618/running_page>.
