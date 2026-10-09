# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Watson 本人高频查看训练记录、年度变化和单次跑步数据；公开访客了解他的长期跑步历程。两类使用者对本次改版同等重要。

## Product Purpose

Watson Running 展示个人运动记录，让人从十年的积累进入某一年、某个月与某次运动，理解距离、配速和训练细节。成功的页面既能快速讲清这段历程，也能让本人准确找到和比较记录。

## Positioning

内容来自真实的个人运动数据和公开前经过审核的静态导出。单次活动可展示每公里分段、心率、步频、海拔等已记录的细节，不用虚构数据填补缺失项。

## Operating Context

Python 管道从运动平台及私有主档同步、清洗并生成公开 JSON/SVG；React/Vite 以静态站点呈现。当前个人站点采用 Classic 主题，Dashboard 是另一内置主题。独立 RunAgent 服务提供 AI 能力，站点现有聊天入口仅在开发环境显示。

## Capabilities and Constraints

- 首页、周期汇总、地图、记录列表和单次活动详情；年度与运动类型筛选。
- 公开活动详情中的估算值必须标明来源，不得把缺失值显示为零。
- 原始轨迹、精确起终点、平台凭据与私有主档不因展示或 AI 问答进入公开站点。既有路线端点处理保留每端 500 米裁剪；若没有可保留的中段，短轨迹展示原貌。
- 静态部署与 RunAgent 后端保持独立；正式的 REST/SSE、数据感知和生产聊天需要独立契约及部署评审。
- 项目源自 `yihong0618/running_page`，原 MIT License、贡献者 attribution 与历史应保留。

## Brand Commitments

保留 Watson Running 名称、现有 Watson 标志和个人跑步叙事。既有文案与运动事实是内容依据；调整排版时不改写个人经历或制造成绩。

## Evidence on Hand

仓库中的公开 `activities.json`、活动详情 JSON、SVG 与线上 `run.watsonzhu.cn` 页面提供真实展示内容。私有主档在仓库外，不作为设计 fixture 或公开截图来源。

## Product Principles

1. 先说明数据代表哪个时间范围，再展示数字。
2. 从十年历程到单次活动的路径应简短且可回退。
3. 缺失与失败状态要诚实，并保留其他可用信息。
4. 隐私规则先于地图效果和 AI 便利性。
5. 同等服务首次访问者与高频查看记录的跑者。

## Accessibility & Inclusion

页面需支持键盘、触摸和窄屏，亮暗两种显示环境均可读；图表数据不只依赖颜色，动画尊重减少动态效果设置。
