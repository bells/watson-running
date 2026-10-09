# RunAgent integration boundary

## Status

`bells/run-agent` is Watson Running's corresponding backend, maintained as a separate repository. Classic has a **development-only ordinary chat UI**. Existing activity pages still load generated static data. The browser sends only the current question; if RunAgent is configured with `RUNNING_DATA_PATH`, its Running Tools can read a separate, generated `activities.json` on the server.

The frontend milestone is POST `/api/chat`, not the future `/api/v1` REST/SSE design below. Frontend and backend records were checked directly: request `{ "message": string }`, response `{ "content": string }`, with a 4000-character question limit. Only the current question is sent. The visible transcript is page memory, not backend conversation context; reloads or route changes can discard it.

The current local RunAgent source includes v0.5 RAG alongside the retained v0.4 APIs. It also implements the following **unversioned backend APIs**, which Watson Running has not integrated:

| Backend API | Current source contract | Frontend status |
| --- | --- | --- |
| `GET /api/chat/stream` | `message` query parameter (1–4000 characters); UTF-8 SSE `token` data fragments or a safe `error` event; no explicit completion event or event ID | No stream client or entry |
| `POST /api/agent` | `{ "conversationId"?: string, "message": string }` → `{ "conversationId": string, "executionId": string, "toolCallCount": number, "content": string }`; `conversationId` is at most 100 characters and limited to letters, digits, `_` and `-` | No Agent client or entry |

`/api/agent` has bounded, process-local conversation Memory and Running Tools for summary, recent runs and personal best. `/api/chat` and `/api/chat/stream` remain stateless across requests, although they can invoke a Running Tool during one request. A `conversationId` is neither authentication nor authorization. The backend's `docs/watson-running-integration.md` still uses a v0.2 status table; the current controller, model and Memory sources are the status authority until that document is updated in its own repository.

## Local development chat

1. Keep RunAgent running at `http://localhost:8080` with its existing server-side model configuration. No model credentials belong in this frontend.
2. Use Node 24 and the repository's pnpm 12.6.0, then run `pnpm install --frozen-lockfile` and `pnpm dev`.
3. Open the Vite URL and click **AI 跑步助手**. Type a question or select an example, then send. Enter sends; Shift+Enter inserts a newline; IME confirmation does not send.
4. To use another backend address, copy `.env.development.example` to the gitignored `.env`, set `RUN_AGENT_PROXY_TARGET`, and restart Vite. A shell variable with the same name also works. This is a Vite-server variable, not a `VITE_*` client variable.

The browser always sends same-origin `POST /api/chat`; the Vite development server proxies `/api` to RunAgent. Existing `PATH_PREFIX` / `BASE_URL` behavior is preserved. The proxy works **only with the development server**. Production builds hide the entry and exclude its lazy module; static hosting and `vite preview` do not provide this development proxy. Production integration requires a separate backend deployment, same-origin reverse proxy, authentication/access policy and review before enabling the UI.

Requests time out after 60 seconds, including response-body reading. Empty input and duplicate sends are prevented. Failure retains the editable question; retry requires an explicit user action. Clear removes draft/transcript/errors and cancels the browser wait. Close/Escape cancels the wait while retaining the question and transcript, then restores entry focus. Cancellation does **not** guarantee that backend/provider work or billing stops.

Markdown uses `react-markdown` with `remark-gfm` for tables, skips raw HTML, keeps safe link handling and suppresses images. There is no localStorage/sessionStorage transcript, automatic retry, SSE client, Agent client, RAG, model configuration or browser-sent activity context in this frontend milestone. Backend Tool use is decided by RunAgent; the current UI does not attest that any particular answer used a Running Tool.

### Verification

- `pnpm test:chat`: isolated Node 24 HTTP-boundary tests (no model requests), covering payload/privacy, input, HTTP/network failures, invalid JSON/content, timeout and cancellation.
- Frontend gates: `pnpm run check`, `pnpm exec tsc --noEmit`, `pnpm exec eslint src --ext .ts,.tsx`, `pnpm run build`; build both Classic and Dashboard after shared-layer changes, restoring config afterwards.
- Isolated browser regression: with a Classic dev page open in a Playwright CLI session, run `playwright-cli -s=runagent run-code --filename tests/run-agent-chat.browser.js`. Every chat request in this script is intercepted; it never calls RunAgent. Screenshots go to `/tmp/runagent-*.png`.
- Browser smoke: open, submit “一周大概跑几次比较合适”, check same-origin request and real answer. Separately simulate failure/slow responses for retries, duplicate sends and clear/close races. Check desktop/narrow layouts, light/dark, focus, composition and scroll preservation. Synthetic composition does not replace physical IME/device checks.
- Run evidence and any remaining limitations are recorded in `openspec/changes/add-runagent-chat-ui/verification.md`.

## Repository responsibilities

### watson-running

Repository: <https://github.com/bells/watson-running>

- React and TypeScript user experience
- Running dashboard, maps, charts, statistics, and history
- RunAgent conversation and insight presentation
- Browser-side request lifecycle, reconnect state, cancellation, and error feedback
- Typed client contracts for REST responses and SSE events

### run-agent

Repository: <https://github.com/bells/run-agent>

- Java 21 and Spring Boot runtime
- Spring AI model integration
- Tool calling and agent orchestration
- Bounded process-local conversation Memory for `/api/agent`; durable memory and runner-profile persistence are future work
- v0.5 local Knowledge QA RAG through separate `/api/knowledge/ask` and local-profile `/api/knowledge/search`; not integrated in Watson Running
- MCP integration (future)
- Evaluation, tracing, safety controls, and service-side authorization

The Java service remains a separate repository and deployment unit. Do not copy its runtime, model credentials, memory store, or business logic into Watson Running.

## Planned transport

```text
watson-running
        |
        | HTTPS REST
        | - commands and bounded queries
        | - conversation/session lifecycle
        |
        | SSE
        | - streamed model output
        | - tool progress
        | - completion and error events
        v
run-agent
```

REST is intended for request/response operations and resource lifecycle. SSE is intended for one-way streamed results. The first integration should not add WebSocket infrastructure unless a verified bidirectional requirement appears.

## Future production contract rules

- Define every cross-repository payload explicitly in Java and TypeScript.
- Version externally visible endpoints, starting with `/api/v1`.
- Give every SSE event a stable event name and typed data payload.
- Include request or conversation identifiers so reconnects and duplicate events can be handled deterministically.
- Treat model output and tool output as untrusted data.
- Keep provider keys and service credentials exclusively in RunAgent.
- Return structured error codes; do not make the UI parse exception messages.
- Add timeouts, cancellation, retry limits, and an observable terminal state.

## Data and privacy

Running tracks contain precise locations. The first RunAgent integration must define the minimum data sent to the service and reuse Watson Running's existing privacy filtering. Raw GPX, exact start/end points, platform credentials, and repository Secrets must not be exposed to the browser or model by default.

## Deferred frontend data-aware integration scope

Deferred; not part of the ordinary-chat milestone:

1. A reviewed, versioned contract for the backend's existing read-only Running Tools; no new browser access to raw activity files.
2. A typed question request with a bounded activity-data context.
3. SSE streaming for answer text, explicit completion/error events and any approved tool progress event; the current backend exposes only `token` / `error`.
4. Explicit empty, loading, reconnecting, cancelled, failed, and complete UI states.
5. Contract tests shared as fixtures between the two repositories.
6. Evaluation cases for numerical correctness, privacy, and unsupported questions.

Not in v0.1:

- Writing or deleting activities
- Editing the SQLite database from RunAgent
- Moving the Python synchronization pipeline into Java
- Sending platform credentials to the browser or LLM
- Combining both repositories into a monorepo


## 2026-10-07 source review and proposed v1 fixtures

See [v1 contract draft](contracts/runagent-v1/README.md) for field-by-field differences, draft-07 schemas, synthetic JSON/SSE fixtures, terminal events, safe errors, timeout/cancellation, manual retry and reconnect limits. Run `pnpm test:contracts` to validate these local examples. No v1 client or public entry is enabled; Java DTO adoption and cross-repository fixture tests are still prerequisites.

v0.5 RAG is kept in separate Knowledge controllers/services. `QuestionAnswerAdvisor` is used by `KnowledgeQaService`, not globally by `RunAgentService`. RAG does not embed `activities.json` or conversation Memory. This source review confirms the separation of call paths; it does not claim a full v0.5 runtime regression or Knowledge API verification.

### Running Tool read-only data contract

| Boundary | Current source behavior |
| --- | --- |
| Input | Explicit server-side `RUNNING_DATA_PATH` to generated `activities.json`, reread per query; no browser upload |
| Minimal fields | `run_id`, `type`, `distance` (metres), `moving_time` (H:MM:SS or N days, H:MM:SS), `start_date_local` (local calendar date); unknown fields ignored |
| Sports/range | Only `type=Run`; summary/recent use inclusive date ranges capped at 366 days, recent limit 1–20 |
| Summary | Count, kilometres and seconds; deterministic server calculation |
| Recent | ID, date, kilometres, seconds and average pace seconds/km; newest first |
| PB | Whole activities within ±5% of the target distance; fastest average pace, explicitly approximate; no exact split/race PB claim |
| Read-only | No SQLite/GPX/TCX/FIT/SVG writes or sync; missing/invalid data must produce an unavailable result, never invented personal history |
| Memory | Only `/api/agent`, bounded process-local messages; conversationId is not authentication or authorization |

The browser currently sends only `{message}`. Minimum Tool fields are a server read contract, not permission to include activity arrays in chat requests. The current backend response does not provide structured citations or prove which Tool supplied each assertion; the UI therefore does not label ordinary answers as verified personal analysis.

### Privacy and deployment review

- [x] Example messages, IDs and answer content are synthetic; no real run statistics, routes, endpoints, credentials or private notes in fixtures.
- [x] No automatic browser activity context, raw routes or extra source fields in the request schemas.
- [x] No model keys, RAG text/chunks, vector index or local configuration copied into frontend assets.
- [x] Existing development-only entry and same-origin Vite proxy retained; frontend production builds have no ChatAssistant chunk.
- [ ] Backend agrees to v1 DTOs, fixtures and terminal/reconnect rules; frontend checks alone do not satisfy this.
- [ ] Production authentication, conversation ownership, same-origin HTTPS proxy/restricted CORS, rate limits, data permissions and end-to-end deployment acceptance.
