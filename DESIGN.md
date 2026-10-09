---
name: Watson Running
description: 赛道记录册；用清楚的期间、数字和公开路线呈现真实运动历程。
colors:
  surface-light: '#f7f8fa'
  raised-light: '#ffffff'
  text-light: '#202a33'
  muted-light: '#52616d'
  border-light: '#d4dde3'
  accent-light: '#405000'
  accent-fill: '#e0ed5e'
  warning-light: '#815013'
  heart-light: '#b34555'
  cadence-light: '#326c86'
  elevation-light: '#69589a'
  surface-dark: '#14191d'
  raised-dark: '#202830'
  text-dark: '#e6edf2'
  muted-dark: '#a6b2ba'
  border-dark: '#37424a'
  warning-dark: '#e6b873'
  heart-dark: '#f18a91'
  cadence-dark: '#7fcee7'
  elevation-dark: '#b7a1ed'
typography:
  display:
    fontFamily: 'IBM Plex Sans, system-ui, -apple-system, sans-serif'
    fontSize: 'clamp(32px, 4vw, 56px)'
    fontWeight: 700
    lineHeight: 1.1
  metric:
    fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, monospace'
    fontSize: '32px'
    fontWeight: 600
  title:
    fontFamily: 'IBM Plex Sans, system-ui, -apple-system, sans-serif'
    fontSize: '23px'
    fontWeight: 600
  body:
    fontFamily: 'IBM Plex Sans, system-ui, -apple-system, sans-serif'
    fontSize: '14px'
  label:
    fontFamily: 'IBM Plex Sans, system-ui, -apple-system, sans-serif'
    fontSize: '13px'
    fontWeight: 400
  status-title:
    fontFamily: 'IBM Plex Sans, system-ui, -apple-system, sans-serif'
    fontSize: '15px'
    lineHeight: 1.4
rounded:
  control: '6px'
  utility: '8px'
  panel: '12px'
  pill: 'calc(infinity * 1px)'
spacing:
  compact: '8px'
  small: '12px'
  medium: '16px'
  inset: '20px'
  section: '24px'
  large: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent-fill}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.control}'
    padding: '9px 16px'
  button-secondary:
    backgroundColor: '{colors.raised-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
  select:
    backgroundColor: '{colors.raised-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.control}'
    padding: '8px 12px'
  chip-selected:
    backgroundColor: '{colors.accent-fill}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.pill}'
    padding: '4px 12px'
  chart-card:
    backgroundColor: '{colors.raised-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.panel}'
    padding: '20px 16px 10px'
  dashboard-card:
    backgroundColor: '{colors.raised-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.panel}'
    padding: '20px'
  status-panel:
    backgroundColor: '{colors.raised-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.panel}'
    padding: '24px'
---

# Design System: Watson Running

## Overview

**Creative North Star: "赛道记录册"**

Watson 的个人运动历程由真实记录、期间、分段和公开路线组织成册。石墨深色与暖白浅色共享一套语义颜色；IBM Plex 的文字与数字构成克制而清楚的节奏。保留 Watson 名称、既有标志和个人文案，不用虚构成绩或装饰数据形成视觉重点。

Classic 用通栏记录、细分隔线和周期区段呈现档案；Dashboard 保留有边框的卡片网格。两者共享可读的期间、数字、单位和局部状态，但不要求所有页面使用同一种容器。首屏与详情可以强调真实距离，密集记录则依靠对齐和字重建立层级。

本文件按当前源码与本地浏览器截图提取，记录实现后的系统，不代表线上发布验证。颜色源在 `src/core/styles/tokens.css`；组件细节在各主题 CSS Modules 与 Tailwind class 中。前面的 token 是这些已用值的机器可读映射，并没有新增运行时 CSS token。前面组件颜色以浅色为基准；实现继续使用 `--running-*` 的明暗映射。

**Key Characteristics:**

- 石墨 / 暖白完整主题，荧光黄填充与主题可读强调色分工。
- 数字对齐、单位可读、期间明确，真实数据决定强调程度。
- 档案区段以细线分隔；图表和局部状态以有边框的容器承载。
- 控件有可见焦点；窄屏将记录转为纵向条目。
- 缺失和局部失败直接说明，保留其余可用内容。

## Colors

低饱和背景与灰蓝次要文字承载记录，跑步强调色提供识别，辅助色只负责有文字说明的状态或曲线。Sidecar 的 OKLCH 明度条是面板展示用合成色阶，不是新增运行时颜色。

### Primary

- **跑道荧光黄**（`accent-fill`）：两套主题中的主要按钮、选中筛选和深色跑步强调。填充内文字使用浅色主题的炭黑文字。
- **深橄榄**（`accent-light`）：浅色主题的操作链接、累计距离、分段条和焦点；深色主题这些用途映射为跑道荧光黄。

### Secondary

- **心率玫红**（`heart-light` / `heart-dark`）：心率曲线及兼容 SVG 特殊序列。
- **步频湖蓝**（`cadence-light` / `cadence-dark`）：步频曲线及兼容 SVG 特殊序列。
- **海拔灰紫**（`elevation-light` / `elevation-dark`）：海拔曲线。曲线必须配标题、单位与文字值。
- **警示赭色**（`warning-*`）：共享错误面板标题的警示色。

### Neutral

- **暖白 / 石墨**（`surface-*`）：页面底色。
- **纸白 / 深灰层**（`raised-*`）：字段、图表卡片、状态面板和记录选中背景。
- **炭黑 / 冷白**（`text-*`）：标题与正文。
- **灰蓝墨**（`muted-*`）：期间、单位、标签、来源与状态解释；使用独立颜色而非统一降低透明度。
- **灰蓝细线**（`border-*`）：区段、记录行、指标格和容器边界。

### Named Rules

**The Theme Pair Rule.** 每个新表面使用共享语义颜色，并同时检查石墨与暖白主题；不要把深色可读的荧光黄直接用作浅色正文。

**The Data Accent Rule.** 跑步数字与可操作重点使用跑步强调色；辅助曲线颜色随语义固定，并配文字说明。

## Typography

**Display Font:** IBM Plex Sans，回退到 system-ui / -apple-system / sans-serif。

**Body Font:** IBM Plex Sans，同上回退。Classic 当前通过 Google Fonts 导入字体；网络失败或未加载时仍依靠回退字体完整呈现。

**Label/Mono Font:** IBM Plex Mono，回退到 ui-monospace / SFMono-Regular / monospace。已有详情分段编号和英文区段标签直接使用系统等宽字体。

**Character:** Sans 支撑中英文说明和档案标题，Mono 支撑累计距离与密集数字。实现同时使用 `font-variant-numeric: tabular-nums`，数字对齐比装饰字体更重要。

### Hierarchy

- **Display:** Classic 首页品牌标题使用前面的 display role，并保留斜体；累计距离使用同等响应尺寸的 Mono 数字。这是首屏强调，不是普通记录字号。
- **Metric:** 周期累计使用 metric role；指标数字常在（18–28px）之间，单位使用（11–16px）与较低字重。
- **Title:** 档案与详情区段标题使用 title 尺寸，详情字重为（650）；周期标题为（26px / 600），窄屏降到（22px）。
- **Body:** 说明与链接常用 body 尺寸；正文、导航和 Dashboard 标题仍有局部尺寸，不能把全站压成同一字号。
- **Label:** 期间、筛选、单位及次要说明使用 label 尺寸或（12px）局部变体。共享状态解释使用（13px / 1.6），最大行长（44ch）。
- **Status title:** 局部状态标题使用前面的 status-title role。

### Named Rules

**The Number And Unit Rule.** 数字采用等宽或 tabular 排版，单位紧随数值、降低字重但保留可读颜色；期间在数字附近直接说明。

## Layout

重复间距以（8 / 12 / 16 / 20 / 24 / 32px）组成松紧节奏；档案区段常用上下留白与细线，不把每组数字都包进卡片。

Classic 首页最大宽度为 Tailwind `max-w-screen-2xl`（1536px），外层窄屏内边距（16px），大屏水平内边距（64px）。周期汇总与详情桌面容器宽度为（min(1160px, 100% - 40px)）；汇总窄屏为（100% - 32px），详情窄屏为（min(100% - 30px, 500px)）。Dashboard 的主容器为（1400px），内边距（24px）；大屏采用主列加（360px / 380px）侧列，其他尺寸折叠成一列。

档案数字网格从四列转两列；详情六列指标在（850px）以下转三列，在（640px）以下转两列；详情双列图表在（640px）以下变单列。Classic 记录表在（800px）以下转为独立纵向条目；Dashboard 表格在（640px）以下变为每条两列的带标签信息。筛选与导航允许换行，不依靠横向滚动才能进入详情。

**The Local Recovery Rule.** 空筛选、缺失采样、详情错误与地图失败在所属区域说明；保留筛选、记录和返回路径，地图失败不替换整个页面。

## Elevation & Depth

档案、周期汇总与详情主要依靠底色、抬高表面和一像素边界组织层级。Dashboard 卡片静止时有边框无阴影，目标与个人卡片 hover 时使用低透明度强调色填充、边框与柔和阴影；其顶部导航局部使用半透明底色与背景模糊。开发聊天浮动入口和抽屉使用覆盖层阴影。

### Shadow Vocabulary

- **开发浮动入口**（`0 4px 20px #0002`）：仅开发环境聊天启动入口。
- **开发抽屉**（`-12px 0 48px #0003`）：右侧聊天覆盖层；遮罩为（`#0004`）。
- **Dashboard 卡片反馈**（`0 10px 15px -3px` 与 `0 4px 6px -4px`）：Tailwind `shadow-lg` 的两层几何，颜色覆盖为主题强调色的（5%）；与（30%）强调色边框和（5%）强调色背景一起出现。

**The Record Surface Rule.** 默认内容层靠边界与色调区分；保留 Dashboard 卡片 hover 与覆盖层自身的阴影和模糊，不将它们推广为记录行的装饰。

## Shapes

字段和常用文字按钮采用 control 圆角；Dashboard 工具按钮采用 utility 圆角；状态面板、图表与 Dashboard 容器采用 panel 圆角。年度筛选为 pill；Classic 主题切换按钮为圆形。细线是档案的原生材料，不使用“禁止边框”之类规则。

圆形配速章是单次活动详情的局部签名：描边使用强调色，数字保留真实配速；其倾斜与尺寸不成为所有指标的全站模板。

## Components

### Buttons

- **Character:** 简短动作与可恢复状态；通栏档案中的次要路径通常采用带下划线的强调色文字链接。
- **Primary:** 荧光黄填充、炭黑文字、control 圆角；共享重试按钮的内边距见前面组件 token，最小高度（44px）。Hover 使用（brightness(0.96)），focus 使用（3px）轮廓与（3px）偏移。
- **Secondary:** 抬高表面、细边框、control 圆角；周期分页内边距见 token。禁用分页透明度为（0.4），不继续呈现可操作光标。
- **Utility:** 主题按钮（44px × 44px）；Classic 为圆形，Dashboard 为 utility 圆角。Hover 使用抬高表面。
- **Focus:** 全局交互元素使用主题焦点色的（2px）outline 与（3px）offset。详情返回链接采用（5px）offset。

### Chips

- **Style:** Dashboard 年度和距离筛选为 pill，字号（12px / 500）、最小高度（44px）。
- **State:** 选中为荧光黄填充和炭黑文字；未选中为边界色底与次要文字，hover 提升文字颜色。选择必须在文字上下文中有意义。

### Cards / Containers

- **Character:** 真实图表、局部状态与 Dashboard 的内容框；Classic 档案主结构仍用区段。
- **Shape:** panel 圆角，一像素边框，抬高表面，无常驻内容阴影。
- **Padding:** 图表内边距见 chart-card；共享状态见 status-panel；Dashboard 常用（24px）。
- **States:** 记录行 hover / selected 使用抬高表面；Classic 选中记录首列使用跑步强调色。
- **Dashboard hover:** 目标与个人卡片使用 dashboard-card 的（20px）内边距，颜色与阴影反馈见 Elevation；过渡时长（300ms），尊重 reduced motion。

### Inputs / Fields

- **Select:** 独立标签、最小高度（44px）、control 圆角、抬高表面与细边框，内边距见 select。
- **Focus / Disabled:** 使用共享可见焦点；周期选择禁用透明度（0.6）。
- **开发文本框:** 聊天使用（10px）圆角、（12px）内边距、（16px / 1.5）字体；其尺寸是该组件的实现值，不扩展为全站字段尺度。

### Navigation

Classic 保留 Watson 标志与既有链接，文本从窄屏（14px）到大屏（16px）；Dashboard 使用 Watson 标志与名称、活动页面按钮和主题/语言工具按钮。Dashboard 活动页文字采用强调色，其他文字为次要色，hover 恢复正文色。工具按钮保持（44px）触控尺寸，窄屏导航可换行。

### Status Panel

同一局部组件承载 loading、empty、error、map：标题、解释和可选恢复动作纵向居中，间距（10px），普通最小高度（160px），地图状态最小高度（220px）。Loading 使用透明边界和背景；error 标题使用警示色并具有 alert 语义；其余状态使用 status 语义。缺失采样显示文字说明，不画零值曲线。

### Record Rows And Splits

记录行和每公里分段通过细线、数字对齐与文字标签形成节奏。窄屏记录用两列标签/数字与独立详情链接；分段同时保留公里编号、条形与配速文字。条形表示真实数据，不用装饰条替代缺失项。

## Do's and Don'ts

### Do:

- **Do** 从共享 `--running-*` 语义颜色取值，并核对明暗两套主题。
- **Do** 在数字附近写明期间、单位和适用记录范围；保留来源与估算说明。
- **Do** 使用等宽 / tabular 数字和可读的单位、日期、说明文字。
- **Do** 保持可见键盘焦点与（44px）主要控件触控高度。
- **Do** 用细线组织记录区段，用有边框表面承载图表和局部状态。
- **Do** 将缺失和失败说明留在所属区域，并保留可用记录及返回路径。

### Don't:

- **Don't** 把荧光黄作为浅色主题的正文色，或让重要单位仅靠透明度变淡。
- **Don't** 用虚构运动数据、零值曲线或未核实成绩填补缺失记录。
- **Don't** 为新页面另建一套脱离共享明暗 token 的配色。
- **Don't** 将详情配速章、开发抽屉阴影或 Dashboard 卡片网格强制套在所有页面。
- **Don't** 用私有原始轨迹或精确起终点补画公开页面与设计预览。
- **Don't** 把现有开发聊天样式记录解释为生产聊天已经开放。
