export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  content: string;
}

export const CHAT_TIMEOUT_MS = 60_000;
export const CHAT_MAX_LENGTH = 4_000;

type ChatErrorKind =
  'input' | 'http' | 'network' | 'timeout' | 'invalid' | 'cancelled';

const errorMessages: Record<ChatErrorKind, string> = {
  input: '请输入 1–4000 字的问题。',
  http: '服务暂时不可用，请稍后重试。',
  network: '连接失败，请检查本地 RunAgent 是否已启动。',
  timeout: '等待超时，请稍后重试。',
  invalid: '回答格式异常，请重试。',
  cancelled: '已取消等待。',
};

export class ChatError extends Error {
  readonly kind: ChatErrorKind;

  constructor(kind: ChatErrorKind) {
    super(errorMessages[kind]);
    this.name = 'ChatError';
    this.kind = kind;
  }
}

export async function requestChat(
  request: ChatRequest,
  signal: AbortSignal,
  timeoutMs = CHAT_TIMEOUT_MS
): Promise<ChatResponse> {
  const message = request.message.trim();
  if (!message || message.length > CHAT_MAX_LENGTH)
    throw new ChatError('input');

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message } satisfies ChatRequest),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) throw new ChatError('http');
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ChatError('invalid');
    }
    if (
      typeof data !== 'object' ||
      data === null ||
      !('content' in data) ||
      typeof data.content !== 'string' ||
      !data.content.trim()
    ) {
      throw new ChatError('invalid');
    }
    return { content: data.content };
  } catch (error: unknown) {
    if (signal.aborted) throw new ChatError('cancelled');
    if (timedOut) throw new ChatError('timeout');
    if (error instanceof ChatError) throw error;
    throw new ChatError('network');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
