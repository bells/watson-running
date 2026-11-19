import { isPrivateChatToken, isRunAgentRequestId } from './runAgentChat';

export const trainingDistances = [
  'FIVE_K',
  'TEN_K',
  'HALF_MARATHON',
  'MARATHON',
] as const;
export type TrainingDistance = (typeof trainingDistances)[number];

interface TrainingDateRange {
  startDate: string;
  endDate: string;
}

interface TrainingSummaryRequest extends TrainingDateRange {
  kind: 'SUMMARY';
}

interface TrainingBestRequest {
  kind: 'PERSONAL_BEST';
  distanceType: TrainingDistance;
}

export type TrainingRequest = TrainingSummaryRequest | TrainingBestRequest;

interface TrainingResponseMetadata {
  requestId: string;
  dataThrough: string | null;
}

export interface TrainingSummaryResponse
  extends TrainingSummaryRequest, TrainingResponseMetadata {
  runCount: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  averagePaceSecondsPerKm: number | null;
}

interface TrainingBestResult {
  date: string;
  activityDistanceKm: number;
  durationSeconds: number;
  averagePaceSecondsPerKm: number;
}

export interface TrainingBestResponse
  extends TrainingBestRequest, TrainingResponseMetadata {
  approximate: true;
  result: TrainingBestResult | null;
}

export type TrainingResponse = TrainingSummaryResponse | TrainingBestResponse;

const DAY_MS = 86_400_000;
const TRAINING_TIMEOUT_MS = 20_000;

const localIsoDate = (date: Date) =>
  [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export function recentTrainingRange(
  days: 7 | 30,
  today = new Date()
): TrainingDateRange {
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: localIsoDate(start), endDate: localIsoDate(today) };
}

function isoDateTimestamp(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const time = isoDateTimestamp(value);
  return (
    Number.isFinite(time) && new Date(time).toISOString().startsWith(value)
  );
}

export function isValidTrainingRange(startDate: string, endDate: string) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return false;
  const duration = isoDateTimestamp(endDate) - isoDateTimestamp(startDate);
  return duration >= 0 && duration < 366 * DAY_MS;
}

type TrainingErrorKind =
  | 'invalidRequest'
  | 'unauthorized'
  | 'rateLimited'
  | 'unavailable'
  | 'http'
  | 'invalidResponse'
  | 'network'
  | 'timeout'
  | 'cancelled';

const errorsByStatus: Partial<Record<number, TrainingErrorKind>> = {
  400: 'invalidRequest',
  401: 'unauthorized',
  429: 'rateLimited',
  503: 'unavailable',
};

const errorMessages: Record<TrainingErrorKind, string> = {
  invalidRequest: '请输入有效日期，区间最多包含 366 天。',
  unauthorized: '访问令牌不正确，请检查后重试。',
  rateLimited: '请求过于频繁，请稍后再试。',
  unavailable: '暂时无法读取训练数据，请稍后重试。',
  http: '训练统计暂不可用，请稍后重试。',
  invalidResponse: '统计结果格式异常，请重试。',
  network: '连接失败，请稍后重试。',
  timeout: '等待统计超时，请稍后重试。',
  cancelled: '已取消查询。',
};

export class TrainingError extends Error {
  readonly kind: TrainingErrorKind;
  readonly requestId?: string;

  constructor(kind: TrainingErrorKind, requestId?: string) {
    super(errorMessages[kind]);
    this.name = 'TrainingError';
    this.kind = kind;
    this.requestId = requestId;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isWholeQuantity(value: unknown): value is number {
  return isQuantity(value) && Number.isSafeInteger(value);
}

function readRequestId(value: unknown) {
  return isObject(value) && isRunAgentRequestId(value.requestId)
    ? value.requestId
    : undefined;
}

function readBestResult(value: unknown): TrainingBestResult | null {
  if (value === null) return null;
  if (!isObject(value)) throw new TrainingError('invalidResponse');
  const { date, activityDistanceKm, durationSeconds, averagePaceSecondsPerKm } =
    value;
  if (
    !isIsoDate(date) ||
    !isQuantity(activityDistanceKm) ||
    !isWholeQuantity(durationSeconds) ||
    !isWholeQuantity(averagePaceSecondsPerKm)
  ) {
    throw new TrainingError('invalidResponse');
  }
  return { date, activityDistanceKm, durationSeconds, averagePaceSecondsPerKm };
}

function readResult(
  request: TrainingRequest,
  value: unknown
): TrainingResponse {
  const requestId = readRequestId(value);
  if (!isObject(value) || !requestId || value.kind !== request.kind) {
    throw new TrainingError('invalidResponse', requestId);
  }
  const { dataThrough } = value;
  if (dataThrough !== null && !isIsoDate(dataThrough)) {
    throw new TrainingError('invalidResponse', requestId);
  }
  if (request.kind === 'PERSONAL_BEST') {
    if (
      value.distanceType !== request.distanceType ||
      value.approximate !== true
    ) {
      throw new TrainingError('invalidResponse', requestId);
    }
    return {
      ...request,
      requestId,
      dataThrough,
      approximate: true,
      result: readBestResult(value.result),
    };
  }
  const {
    runCount,
    totalDistanceKm,
    totalDurationSeconds,
    averagePaceSecondsPerKm,
  } = value;
  if (
    value.startDate !== request.startDate ||
    value.endDate !== request.endDate ||
    !isWholeQuantity(runCount) ||
    !isQuantity(totalDistanceKm) ||
    !isWholeQuantity(totalDurationSeconds) ||
    (averagePaceSecondsPerKm !== null &&
      !isWholeQuantity(averagePaceSecondsPerKm))
  ) {
    throw new TrainingError('invalidResponse', requestId);
  }
  return {
    ...request,
    requestId,
    dataThrough,
    runCount,
    totalDistanceKm,
    totalDurationSeconds,
    averagePaceSecondsPerKm,
  };
}

function toPayload(request: TrainingRequest): TrainingRequest {
  if (request.kind === 'SUMMARY') {
    const { startDate, endDate } = request;
    if (!isValidTrainingRange(startDate, endDate)) {
      throw new TrainingError('invalidRequest');
    }
    return { kind: 'SUMMARY', startDate, endDate };
  }
  if (
    request.kind !== 'PERSONAL_BEST' ||
    !trainingDistances.includes(request.distanceType)
  ) {
    throw new TrainingError('invalidRequest');
  }
  return { kind: 'PERSONAL_BEST', distanceType: request.distanceType };
}

export async function requestTrainingStats(
  request: TrainingRequest,
  accessToken: string,
  signal: AbortSignal,
  timeoutMs = TRAINING_TIMEOUT_MS
): Promise<TrainingResponse> {
  if (!isPrivateChatToken(accessToken)) throw new TrainingError('unauthorized');
  const payload = toPayload(request);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const requestSignal = AbortSignal.any([signal, deadline.signal]);
  try {
    requestSignal.throwIfAborted();
    const response = await fetch('/api/v1/training/stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: requestSignal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => undefined);
    requestSignal.throwIfAborted();
    if (!response.ok) {
      throw new TrainingError(
        errorsByStatus[response.status] ?? 'http',
        readRequestId(body)
      );
    }
    return readResult(payload, body);
  } catch (error) {
    if (signal.aborted) throw new TrainingError('cancelled');
    if (deadline.signal.aborted) throw new TrainingError('timeout');
    if (error instanceof TrainingError) throw error;
    throw new TrainingError('network');
  } finally {
    clearTimeout(timer);
  }
}
