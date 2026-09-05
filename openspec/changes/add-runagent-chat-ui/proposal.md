## Why

RunAgent already exposes ordinary chat, but the Classic site has no way to use it. A development-only UI enables the first local integration without exposing an undeployed service on the public site.

## What Changes

- Add an accessible responsive AI 跑步助手 panel to Classic, with memory-only messages, examples, safe Markdown, manual retry and cancellation.
- Add typed fetch service and chat Hook, a 60-second timeout and runtime response validation.
- Proxy same-origin `/api` through Vite to a configurable development target, defaulting to localhost:8080; hide the entry in production.
- Document local startup and production boundaries; verify browser behavior with isolated faults and a small real smoke request if the backend is available.

## Capabilities

### New Capabilities

- `runagent-chat`: Development-only, single-turn chat and its transport/lifecycle/accessibility contract.

### Modified Capabilities

None.

## Impact

Classic components, new core service/Hook, Vite config, Markdown dependency and integration documentation. Backend is read-only; no SSE, tools, RAG, memory, model credentials, personal activity upload, data regeneration, deployment or Git delivery actions.
