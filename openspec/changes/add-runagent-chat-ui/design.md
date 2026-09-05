## Context

Classic uses CSS Modules and existing CSS theme variables; Layout includes Header on the home route; Summary renders ActivityList independently. Attach the entry to the home Layout without altering Summary navigation. No Markdown renderer or frontend unit suite exists. Backend ChatController and records confirm POST /api/chat, message/content strings and a 4000-character input limit. Integration documentation describes future versioned REST/SSE, which must be distinguished from this explicitly requested development milestone. CodeGraph was current before changes.

## Goals / Non-Goals

**Goals:** Separate HTTP validation from React lifecycle and Classic presentation; make cancellation races and manual retries testable without paid calls.

**Non-Goals:** Do not alter activity contracts, routes, backend files or production deployment.

## Decisions

- Put reusable request/response types and fetch in core/services/runAgentChat.ts and lifecycle in core/hooks/useRunAgentChat.ts. Native fetch suffices; no HTTP framework.
- Render a lazily loaded Classic ChatAssistant from Layout behind import.meta.env.DEV. Use a compact fixed entry outside navigation and a native modal dialog for focus containment/Escape. Keep Hook mounted when closed; close cancels the browser wait and restores focus. Reload/navigation may discard state.
- Use react-markdown with remark-gfm for tables observed in the real model answer, raw HTML skipped, safe URL defaults and images suppressed to avoid unsolicited remote image requests. Hand-written Markdown parsing and raw HTML injection are unnecessary risks.
- Track the active AbortController synchronously to prevent duplicate submissions and invalidate callbacks on clear, close and unmount. Keep failed drafts; append only one user row per explicit attempt. Use a 60-second fetch/body timeout and controlled error kinds.
- Auto-scroll only when already near the bottom; provide an explicit latest-message control after upward scrolling. CSS uses 100dvh and safe-area insets on narrow screens.
- Vite loadEnv reads RUN_AGENT_PROXY_TARGET without the VITE prefix; the browser always uses /api/chat. Keep existing base resolution untouched. Production has no chat import/entry.
- Verify service faults with Node's test runner and browser lifecycle with Playwright interception. A separate real browser request proves proxy/backend integration; simulated results are explicitly labeled.

## Risks / Trade-offs

- Browser abort does not guarantee provider cancellation or billing cessation → document this boundary.
- Native IME/device keyboard behavior cannot be completely established by synthetic events → test composition events and report remaining physical-device coverage.
- Public static hosting has no Vite proxy → production entry stays hidden until a separate deployment design.
- Long model output can create scroll overflow → scoped Markdown styles and bounded scrolling/code blocks.

## Migration Plan

No data migration. Install the dependency with pnpm 8.9.0, run Vite alongside the existing backend, and use the default development gate. Reverting this scoped UI/config change removes the integration without touching running data.
