export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  content: string;
}

export interface PrivateChatResponse extends ChatResponse {
  requestId: string;
}

export const CHAT_TIMEOUT_MS = 60_000;
export const CHAT_MAX_LENGTH = 4_000;
export const isPrivateChatToken = (value: string) =>
  /^[a-f0-9]{48}$/.test(value);
export const isRunAgentRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

type ChatErrorKind =
  | 'input'
  | 'http'
  | 'network'
  | 'timeout'
  | 'invalid'
  | 'cancelled'
  | 'unauthorized'
  | 'rateLimited';

const errorMessages: Record<ChatErrorKind, string> = {
  input: '请输入 1–4000 字的问题。',
  http: '服务暂时不可用，请稍后重试。',
  network: '连接失败，请稍后重试。',
  timeout: '等待超时，请稍后重试。',
  invalid: '回答格式异常，请重试。',
  cancelled: '已取消等待。',
  unauthorized: '访问令牌不正确，请检查后重试。',
  rateLimited: '请求过于频繁，请等几秒再试。',
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
  timeoutMs = CHAT_TIMEOUT_MS,
  accessToken?: string
): Promise<ChatResponse> {
  const message = request.message.trim();
  const privateChat = accessToken !== undefined;
  if (
    !message ||
    (privateChat ? [...message].length : message.length) > CHAT_MAX_LENGTH
  )
    throw new ChatError('input');
  if (privateChat && !isPrivateChatToken(accessToken))
    throw new ChatError('unauthorized');

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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (privateChat) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(privateChat ? '/api/v1/chat' : '/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message } satisfies ChatRequest),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    });
    if (privateChat && response.status === 401)
      throw new ChatError('unauthorized');
    if (privateChat && response.status === 429)
      throw new ChatError('rateLimited');
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
    if (!privateChat) return { content: data.content };
    if (!('requestId' in data) || !isRunAgentRequestId(data.requestId)) {
      throw new ChatError('invalid');
    }
    const privateResponse: PrivateChatResponse = {
      content: data.content,
      requestId: data.requestId,
    };
    return privateResponse;
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
