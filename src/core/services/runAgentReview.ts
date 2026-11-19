import { isPrivateChatToken, isRunAgentRequestId } from './runAgentChat';

interface SummaryFacts {
  distanceMeters: number;
  movingSeconds: number;
  averagePaceSecondsPerKm: number;
}

interface SplitFacts extends SummaryFacts {
  firstHalfPaceSecondsPerKm: number;
  secondHalfPaceSecondsPerKm: number;
  paceDeltaSecondsPerKm: number;
  estimated: boolean;
}

interface ReviewContent {
  schemaVersion: 1;
  runId: number;
  generatedAt: string;
  observations: string[];
  improvement: string;
  nextRun: string;
}

export type RunReviewReport = ReviewContent &
  (
    | { mode: 'SUMMARY'; facts: SummaryFacts }
    | { mode: 'SPLIT_COMPARISON'; facts: SplitFacts }
  );

export type RunReviewResponse =
  | { status: 'READY'; requestId: string; report: RunReviewReport }
  | {
      status: 'MISSING' | 'GENERATING' | 'FAILED' | 'DISABLED';
      requestId: string;
    };

type ErrorKind =
  | 'invalidRequest'
  | 'invalidResponse'
  | 'unauthorized'
  | 'busy'
  | 'unknownRun'
  | 'unavailable'
  | 'timeout'
  | 'cancelled';

const errorMessages: Record<ErrorKind, string> = {
  invalidRequest: '这条跑步记录暂时无法复盘。',
  invalidResponse: '报告格式异常，请稍后查看。',
  unauthorized: '访问令牌无效，请重新输入。',
  busy: '另一份报告正在生成，请稍后重试。',
  unknownRun: '暂时没有找到这条跑步的可分析数据。',
  unavailable: '暂时无法读取复盘，请稍后重试。',
  timeout: '等待超时，可以重新查询报告状态。',
  cancelled: '已停止等待。',
};

export class RunReviewError extends Error {
  readonly kind: ErrorKind;
  readonly requestId: string | undefined;

  constructor(kind: ErrorKind, requestId?: string) {
    super(errorMessages[kind]);
    this.name = 'RunReviewError';
    this.kind = kind;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isReviewText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;

function isReport(value: unknown, runId: number): value is RunReviewReport {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.runId !== runId ||
    typeof value.generatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value.generatedAt) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.observations) ||
    value.observations.length < 1 ||
    value.observations.length > 2 ||
    !value.observations.every(isReviewText) ||
    !isReviewText(value.improvement) ||
    !isReviewText(value.nextRun) ||
    !isRecord(value.facts)
  )
    return false;

  const facts = value.facts;
  if (
    typeof facts.distanceMeters !== 'number' ||
    !Number.isFinite(facts.distanceMeters) ||
    facts.distanceMeters <= 0 ||
    !isNonNegativeInteger(facts.movingSeconds) ||
    facts.movingSeconds === 0 ||
    !isNonNegativeInteger(facts.averagePaceSecondsPerKm)
  )
    return false;

  if (value.mode === 'SUMMARY') return true;
  return (
    value.mode === 'SPLIT_COMPARISON' &&
    isNonNegativeInteger(facts.firstHalfPaceSecondsPerKm) &&
    isNonNegativeInteger(facts.secondHalfPaceSecondsPerKm) &&
    typeof facts.paceDeltaSecondsPerKm === 'number' &&
    Number.isSafeInteger(facts.paceDeltaSecondsPerKm) &&
    typeof facts.estimated === 'boolean'
  );
}

function readReviewResponse(
  status: number,
  data: unknown,
  runId: number
): RunReviewResponse {
  const payload = isRecord(data) ? data : {};
  const { code, generationEnabled } = payload;
  const requestId = isRunAgentRequestId(payload.requestId)
    ? payload.requestId
    : undefined;
  if (status === 401) throw new RunReviewError('unauthorized', requestId);
  if (status === 429) throw new RunReviewError('busy', requestId);
  if (status === 404 && code === 'RUN_NOT_FOUND')
    throw new RunReviewError('unknownRun', requestId);
  if (!requestId)
    throw new RunReviewError(status >= 400 ? 'unavailable' : 'invalidResponse');

  if (status === 202 && payload.status === 'GENERATING')
    return { status: 'GENERATING', requestId };
  if (status === 404 && code === 'REVIEW_NOT_FOUND')
    return {
      status: generationEnabled === false ? 'DISABLED' : 'MISSING',
      requestId,
    };
  if (status === 503 && code === 'REVIEW_GENERATION_DISABLED')
    return { status: 'DISABLED', requestId };
  if (
    (status === 200 && payload.status === 'FAILED') ||
    (status === 503 && code === 'REVIEW_GENERATION_FAILED')
  )
    return {
      status: generationEnabled === false ? 'DISABLED' : 'FAILED',
      requestId,
    };
  if (
    (status === 200 || status === 201) &&
    payload.status === 'READY' &&
    isReport(payload.report, runId)
  )
    return { status: 'READY', requestId, report: payload.report };

  throw new RunReviewError(
    status >= 400 ? 'unavailable' : 'invalidResponse',
    requestId
  );
}

export async function requestRunReview(
  runId: number,
  method: 'GET' | 'POST',
  accessToken: string,
  signal: AbortSignal,
  timeoutMs = 35_000
): Promise<RunReviewResponse> {
  if (!isPrivateChatToken(accessToken))
    throw new RunReviewError('unauthorized');
  if (!Number.isSafeInteger(runId) || runId <= 0)
    throw new RunReviewError('invalidRequest');
  if (signal.aborted) throw new RunReviewError('cancelled');

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`/api/v1/runs/${runId}/review`, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (controller.signal.aborted) throw controller.signal.reason;
    return readReviewResponse(response.status, data, runId);
  } catch (error: unknown) {
    if (signal.aborted) throw new RunReviewError('cancelled');
    if (timedOut) throw new RunReviewError('timeout');
    if (error instanceof RunReviewError) throw error;
    throw new RunReviewError('unavailable');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
