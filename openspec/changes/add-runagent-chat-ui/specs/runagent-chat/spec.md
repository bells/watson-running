## Purpose

Provide an accessible local-development chat experience for asking RunAgent single-turn running questions without sharing personal activity records.

## ADDED Requirements

### Requirement: Development-only entry and responsive panel

Classic SHALL show an AI 跑步助手 entry only in development. The panel SHALL retain existing colors, typography, navigation and map behavior, use a right panel on desktop and fit small touch screens, and provide named close/clear controls, focus containment, focus restoration and Escape dismissal.

#### Scenario: Open and close
- **WHEN** the user opens the entry with keyboard or touch
- **THEN** a named dialog opens with keyboard focus inside; closing restores focus to the entry

#### Scenario: Production
- **WHEN** the site is built for production
- **THEN** the chat entry is absent and no chat request occurs

### Requirement: Memory-only single-turn conversation

The panel SHALL distinguish user and assistant messages, display clickable examples and the text “当前为单轮问答，暂未读取个人跑步记录。”. Only the latest question SHALL be sent; displayed history SHALL stay in page memory without persistence or personal activity data.

#### Scenario: Submit a question
- **WHEN** a user sends a nonblank question of at most 4000 characters
- **THEN** exactly one request containing only that question is sent and “正在思考…” appears

#### Scenario: Keyboard composition and duplicate prevention
- **WHEN** input is blank, an answer is pending, Shift+Enter is pressed, or Enter confirms an IME composition
- **THEN** no additional request is sent; Shift+Enter inserts a newline and ordinary Enter submits eligible input

### Requirement: Safe response and failure lifecycle

The client SHALL validate a nonempty string content response, render paragraphs, lists, bold, code blocks and tables without injecting raw HTML, and show short safe errors for non-2xx, connection failure, timeout after 60 seconds, and invalid responses. Failed questions SHALL remain editable for manual retry, without automatic retries. Clear SHALL cancel the browser wait and invalidate stale results. Closing SHALL cancel the pending wait and retain the draft. Cancellation SHALL NOT promise to stop model billing.

#### Scenario: Failure and retry
- **WHEN** a request fails
- **THEN** the draft is retained and the user can explicitly resend it with no automatic request

#### Scenario: Clear while waiting
- **WHEN** the user clears a pending conversation
- **THEN** messages, draft and errors are cleared and late results cannot reappear

#### Scenario: Read earlier messages
- **WHEN** a new message arrives while the user has scrolled upward
- **THEN** their reading position is preserved; messages automatically become visible when they were already near the bottom

### Requirement: Same-origin development transport

The browser SHALL POST JSON `{ "message": string }` to `/api/chat` and accept `{ "content": string }`. Vite SHALL proxy `/api` to `http://localhost:8080` by default with a server-only development environment override. Existing BASE_URL and PATH_PREFIX behavior SHALL remain unchanged. Production proxying SHALL be documented as separate future configuration.

#### Scenario: Local integration
- **WHEN** the backend and Vite are running and a question is submitted in a real browser
- **THEN** the same-origin request traverses Vite and displays the real backend answer

#### Scenario: Backend unavailable
- **WHEN** the local backend is unavailable
- **THEN** the UI reports a recoverable failure and validation reports the real integration gap separately from simulated tests
