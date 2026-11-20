# RunAgent v1 契约

版本化 Chat、训练统计和复盘使用同一组路径。启用公开访问后，访客省略 Authorization；站主发送服务端颁发的 Bearer 令牌。Agent 和 SSE 部分描述协议草案。目录中的 JSON Schema 和合成 fixtures 用于契约测试。

## 运行建议与依据

`POST /api/v1/chat` 接收可选的 `context`，`POST /api/v1/training/stats` 接收可选的 `adviceContext`。城市和当地计划开跑时间提供天气查询上下文，训练查询还可提供目标。服务端在可用时返回 `evidence.knowledge` 和 `evidence.weather`。训练统计可另外返回纯文本 `advice`。

复盘 POST 按活动 ID 生成报告。可选 `adviceContext` 可附上当次请求的天气，响应中顶层 `weather` 只用于当前浏览器展示。报告里的 `knowledge` 可随同已保存的报告由 GET 返回。

## 训练统计

`POST /api/v1/training/stats` 接收 `training-request.schema.json` 中的两种请求。响应符合 `training-response.schema.json`，带 `requestId` 和 `Cache-Control: no-store`。

- `SUMMARY` 接收 ISO 起止日期。包含首尾，最多 366 天。空区间返回零跑次、零距离、零时长与空配速。配速是总移动秒数除以总公里数后四舍五入。
- `PERSONAL_BEST` 接收 `FIVE_K`、`TEN_K`、`HALF_MARATHON` 或 `MARATHON`。结果是整场活动的估算值，`approximate` 为 `true`。找不到符合条件的活动时 `result` 为 `null`。
- `dataThrough` 表示快照中最近活动日期。兼容的旧数据或空快照可能返回 `null`。
- 无效输入返回 `400 INVALID_REQUEST`，无效令牌返回 `401 UNAUTHORIZED`，快照或 MCP 数据不可用返回 `503 TRAINING_DATA_UNAVAILABLE`。服务端错误消息由客户端映射为固定提示。

## 字段与接口差异

| 拟议接口/字段                               | 约束                                                     | 当前接口与差异                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/chat` 的 `message`            | 非空白，最多 4000 Unicode 字符；仅当前问题，无活动上下文 | `/api/chat` 同名字段；Java `@Size` 与当前 TS `.length` 计 UTF-16 单元，草案 schema 计 Unicode 字符，后端采纳前需统一字符计数规则                |
| Chat `content`                              | 非空文本，不可信 Markdown                                | 当前 `{content}`，无显式回答来源证明                                                                                                            |
| Chat `requestId`                            | 服务端生成，1–100 个字母/数字/`_`/`-`                    | 当前 Chat 响应没有 ID                                                                                                                           |
| `POST /api/v1/agent` 的 `conversationId`    | 可省略，不接受 null；若提供，1–100 个上述字符            | 当前 Java record 可省略或 null；仅 Agent 使用 Memory                                                                                            |
| Agent `message`                             | 同 Chat 的输入约束                                       | 当前同名字段；仍需确认字符计数                                                                                                                  |
| Agent `conversationId` / `executionId`      | 服务端返回非空 ID                                        | 当前已有；executionId 用于执行关联，不能用作调用授权                                                                                            |
| Agent `toolCallCount`                       | 非负整数                                                 | 当前已有；大于零只证明存在 Tool 调用，不能证明所有数字有依据                                                                                    |
| Agent `content`                             | 非空、不可信文本                                         | 当前已有；无结构化证据字段，未来证据展示需独立设计                                                                                              |
| `POST /api/v1/chat/stream`                  | JSON `{message}`；fetch 流，避免把问题放入 URL           | 当前为 `GET /api/chat/stream?message=...`，使用字符串 SSE                                                                                       |
| Stream `type`                               | `token` / `complete` / `error`，对应 SSE event name      | 当前只有 `token` / `error`，无 complete                                                                                                         |
| Stream `requestId`                          | 所有事件属于同一个请求                                   | 当前没有                                                                                                                                        |
| Stream `sequence`                           | 从 0 起连续递增，SSE id 是当前流内 sequence              | 当前没有 ID、顺序或去重声明                                                                                                                     |
| Token `content`                             | 非空文本片段                                             | 当前 token data 是原始字符串，草案为 JSON                                                                                                       |
| Complete                                    | 只带 type/requestId/sequence，一次且最后                 | 当前正常流仅关闭连接，无法区分正常完成与中途断开                                                                                                |
| Error `code` / `message`                    | 稳定枚举与安全文案，一次且最后；保留已接收片段           | 当前流内 error 只含安全字符串；REST 已有结构化 code                                                                                             |
| HTTP Error `requestId` / `code` / `message` | 请求关联 ID、稳定枚举、安全文案                          | 当前 `{timestamp,status,code,message,path}`；已有 `INVALID_REQUEST`、`AI_SERVICE_ERROR`、`AGENT_TIMEOUT`、`AGENT_TOOL_LIMIT` 等，但无 requestId |

对应 `.schema.json` 声明每个字段及额外字段拒绝规则。JSON 与 SSE fixtures 全为自创问题、普通知识与 `synthetic-*` 标识，不含真实统计。采用 JSON Schema draft-07，使用现有 ESLint 开发依赖的 Ajv 校验：`pnpm test:contracts`。这是一条本地样例检查入口；后续后端须复制同一 fixtures 并以 Java 测试确认才算双仓库契约就绪。

## 生命周期与可靠性

- HTTP 校验/认证失败在流开启前返回相应状态码与 error schema；流开启后以 terminal error 结束，不能再改 HTTP 状态码。`complete` 与 `error` 互斥，terminal 后不得再发 token。
- token 按 requestId 与 sequence 处理。同一序号且内容相同可忽略；同序号不同内容、跳号或 requestId 改变都视为协议错误。无 terminal 的 EOF 视为中断，保留部分回答并明确未完成。
- 草案第一阶段**不支持续传**，不承诺 `Last-Event-ID` replay。断线后只允许用户手动发起新请求，不把新流拼到旧回答。需要续传时另行定义事件保留时间、授权、过期错误和 replay 测试。
- 保留前端 60 秒整次请求时限（包含响应体读取）；取消/关闭使浏览器 AbortSignal 生效、拒绝迟到结果。服务端及供应商是否停止执行和计费需要后端实测，前端不作保证。
- 无自动重试。用户手动重试创建新请求；Agent 可能已经写入 Memory，不承诺幂等或 exactly-once。服务端要提供幂等键后才能改变此行为。
- HTTP `401/403` 不重试模型请求；`400` 要求修正输入；`502/503/504` 允许稍后手动重试。浏览器不解析异常文本或显示供应商错误详情。

## 身份与上线条件

conversationId 仅定位 Memory。当前进程内有界 Memory 不提供持久存储、身份隔离、并发会话序列化或删除 API 的生产承诺。正式接入需把 conversationId 绑定认证主体；禁止通过任意 ID 读取其他用户上下文。

后续上线门槛：双方确认对称 Java/TS DTO、字符计数和 fixtures；真实供应商 SSE 的 terminal/cancel 验证；服务端认证及 conversation ownership；HTTPS 同源反向代理或受限 CORS；后端数据读取权限与隐私审计；超时、限流、错误关联、访问日志脱敏；生产环境端到端验证。Classic 本地开发问答继续使用 `/api/chat`。版本化私有入口提供 Chat 和训练统计。
