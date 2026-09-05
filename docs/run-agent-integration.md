# RunAgent integration boundary

## Status

`bells/run-agent` is Watson Running's corresponding backend, maintained as a separate repository. Classic now has a **development-only ordinary chat UI**. Existing activity pages still load generated static data; chat does not read or upload it.

The implemented milestone is POST `/api/chat`, not the future `/api/v1` REST/SSE design below. Frontend and backend records were checked directly: request `{ "message": string }`, response `{ "content": string }`, with a 4000-character question limit. Only the current question is sent. The visible transcript is page memory, not backend conversation context; reloads or route changes can discard it.

## Local development chat

1. Keep RunAgent running at `http://localhost:8080` with its existing server-side model configuration. No model credentials belong in this frontend.
2. Use Node 24 and the repository's pnpm 8.9.0, then run `pnpm install --frozen-lockfile` and `pnpm dev`.
3. Open the Vite URL and click **AI 跑步助手**. Type a question or select an example, then send. Enter sends; Shift+Enter inserts a newline; IME confirmation does not send.
4. To use another backend address, copy `.env.development.example` to the gitignored `.env`, set `RUN_AGENT_PROXY_TARGET`, and restart Vite. A shell variable with the same name also works. This is a Vite-server variable, not a `VITE_*` client variable.

The browser always sends same-origin `POST /api/chat`; the Vite development server proxies `/api` to RunAgent. Existing `PATH_PREFIX` / `BASE_URL` behavior is preserved. The proxy works **only with the development server**. Production builds hide the entry and exclude its lazy module; static hosting and `vite preview` do not provide this development proxy. Production integration requires a separate backend deployment, same-origin reverse proxy, authentication/access policy and review before enabling the UI.

Requests time out after 60 seconds, including response-body reading. Empty input and duplicate sends are prevented. Failure retains the editable question; retry requires an explicit user action. Clear removes draft/transcript/errors and cancels the browser wait. Close/Escape cancels the wait while retaining the question and transcript, then restores entry focus. Cancellation does **not** guarantee that backend/provider work or billing stops.

Markdown uses `react-markdown` with `remark-gfm` for tables, skips raw HTML, keeps safe link handling and suppresses images. There is no localStorage/sessionStorage transcript, automatic retry, SSE, tools, RAG, model configuration, activity context or backend memory in this milestone.

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
- Memory and runner-profile persistence
- Retrieval-augmented generation
- MCP integration
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

## Deferred data-aware integration scope

Deferred; not part of the ordinary-chat milestone:

1. Read-only runner summary endpoint.
2. A typed question request with a bounded activity-data context.
3. SSE streaming for answer text and tool progress.
4. Explicit empty, loading, reconnecting, cancelled, failed, and complete UI states.
5. Contract tests shared as fixtures between the two repositories.
6. Evaluation cases for numerical correctness, privacy, and unsupported questions.

Not in v0.1:

- Writing or deleting activities
- Editing the SQLite database from RunAgent
- Moving the Python synchronization pipeline into Java
- Sending platform credentials to the browser or LLM
- Combining both repositories into a monorepo
