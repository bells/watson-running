# RunAgent chat verification — 2026-09-05

## Real local integration

- Existing backend was inspected read-only: `ChatController`, `ChatRequest`, `ChatResponse` confirm POST `/api/chat`, `{message}` → `{content}`, max 4000 characters.
- One successful real model request was submitted from the Classic panel in a headed Chromium browser: “一周大概跑几次比较合适”. Browser request was `POST http://127.0.0.1:5173/api/chat`, with exactly `{"message":"一周大概跑几次比较合适"}`. Vite's default target was `http://localhost:8080`; no chat interception was installed during this request.
- Response: **200 OK**, `application/json`, approximately **9311 ms**. The answer was visible in the assistant message, the error area was empty and the draft cleared. The answer explained running frequency by experience and goals, including a five-row comparison table. This is real backend evidence, not the isolated test fixture.
- The real answer exposed missing GFM table support. Added `remark-gfm`, then replayed the captured answer's table excerpt locally: five semantic table rows rendered on desktop and at 390px without overflowing the panel. No additional model call was made for this correction. Paragraphs, lists, bold, code and unsafe markup are covered separately by the browser regression.
- Earlier, while the backend was stopped, a real browser attempt returned **502**, Vite reported `ECONNREFUSED`, the UI displayed a safe service error and retained the question. After the owner started RunAgent, the successful call above closed that integration gap. The backend was never stopped, started or modified by this task.

## Automated and browser checks

| Check | Result |
| --- | --- |
| `pnpm test:chat` (Node 24) | 8 passed; no model calls |
| `pnpm run check` | Passed |
| `pnpm exec tsc --noEmit` | Passed |
| `pnpm exec eslint src --ext .ts,.tsx` | 0 errors, 43 existing warnings; changed/new TS/TSX files have no warnings |
| Classic production build, root base | Passed |
| Dashboard production build, `/watson-running` base | Passed; original Classic config restored |
| `openspec validate add-runagent-chat-ui --strict` | Passed |
| `git diff --check` | Passed |
| `tests/run-agent-chat.browser.js` via Playwright CLI | Passed; 11 intercepted requests per complete run, no backend calls |
| Server-only `RUN_AGENT_PROXY_TARGET` override | Resolved correctly to an isolated test address; BASE_URL and empty preview proxy preserved |
| Real production preview | Entry absent; Summary navigation and reload passed; POST `/api/chat` returned 404 |
| Production manifest | No ChatAssistant/Markdown chat lazy chunk |

Browser regression covers blank input, example selection, Enter and Shift+Enter, synthetic composition events and keyCode 229, duplicate prevention, pending state, clear/close stale responses, safe HTTP/network/invalid-response errors, manual retry, semantic Markdown and GFM tables, skipped HTML/images and unsafe links, automatic scrolling near the bottom, preserved reading position, explicit latest-message navigation, Escape, focus restoration and Tab containment, light/dark, 390×844 and 320×568 layouts including scrollbar bounds. The fetch tests additionally cover 60-second default timeout, accelerated timeout including a stalled JSON body, pre-cancelled and actively cancelled requests.

## Evidence and boundaries

Temporary local screenshots (not committed): `/tmp/runagent-real-smoke.png`, `/tmp/runagent-desktop-real-table.png`, `/tmp/runagent-mobile-real-table.png`, `/tmp/runagent-desktop-markdown.png`, `/tmp/runagent-mobile-light.png`, `/tmp/runagent-mobile-dark.png`. The table screenshots replay an excerpt of the real answer; they are not a second live model response.

Physical Chinese IME selection, mobile virtual keyboards/touch hardware, Safari/Firefox and screen-reader output were not verified; composition events, keyboard focus and narrow viewports were automated in Chromium. Existing map font resources showed third-party CORS failures during theme switches; map network availability is not established by these chat checks. Existing build chunk/plugin warnings and existing Summary chart warnings remain outside this change. Dashboard was built, not claimed as a working token-configured browser map.

No database, tracks, activities JSON or statistics SVG were modified or regenerated. Backend files were not changed (its existing untracked `.codegraph/` was preserved). No model credentials, activity context, automatic retries, SSE, tools, RAG or backend memory were introduced. No commit, push or deployment was performed. Cancel only stops the frontend wait and does not guarantee stopping provider work or charges.
