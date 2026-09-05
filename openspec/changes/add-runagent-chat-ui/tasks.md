## 1. Transport and state

- [x] 1.1 Add typed fetch service with validation, 60-second timeout and safe errors; verify success, HTTP/network/invalid/timeout/cancel tests without model calls.
- [x] 1.2 Add memory-only Hook with duplicate prevention, draft retention and stale-result invalidation; verify browser retry, close and clear races.

## 2. Classic interface and development configuration

- [x] 2.1 Add responsive accessible chat panel, examples, safe Markdown and scroll behavior; verify desktop/narrow, light/dark, focus, keyboard and synthetic IME behavior in a browser.
- [x] 2.2 Add development-only lazy entry and server-side proxy override/example; verify production entry absence and both theme builds.
- [x] 2.3 Update integration/startup documentation to distinguish current ordinary chat from future REST/SSE; inspect docs against implemented paths.

## 3. Integration and delivery

- [x] 3.1 Run a real browser question through Vite to the existing backend, or record the exact unavailable-backend gap separately from mocks; capture proxy and rendered-answer evidence.
- [x] 3.2 Run formatting, TypeScript, non-fixing ESLint, builds and strict OpenSpec validation; review final diff and confirm no generated running assets or backend files changed.
