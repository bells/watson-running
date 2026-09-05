# RunAgent integration boundary

## Status

`bells/run-agent` is Watson Running's corresponding backend, maintained and deployed as a separate repository. Watson Running currently loads generated static activity data and has not yet integrated that backend.

This document defines repository responsibilities and the planned REST/SSE integration. RunAgent UI and AI integration are not implemented in Watson Running yet. The responsibilities and proposed scope below are not an inventory of implemented backend features; inspect the backend's current collaboration guide, source, and API contracts before implementing a client.

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

## Contract rules

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

## Proposed v0.1 scope

Planned:

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
