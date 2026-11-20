export interface RunningAdviceContext {
  city?: string;
  runningAt?: string;
  goal?: string;
}

export function runningAdviceContext(
  city: string,
  runningAt: string,
  goal = ''
): RunningAdviceContext | undefined {
  const location = city.trim();
  const trainingGoal = goal.trim();
  if (!location && !trainingGoal) return undefined;
  return {
    ...(location && { city: location }),
    ...(location && runningAt && { runningAt }),
    ...(trainingGoal && { goal: trainingGoal }),
  };
}

type EvidenceStatus = 'READY' | 'NOT_REQUESTED' | 'UNAVAILABLE' | 'NO_MATCH';

export interface KnowledgeEvidence {
  status: EvidenceStatus;
  sources: { title: string; chapter?: string }[];
}

export interface WeatherEvidence {
  status: EvidenceStatus;
  city?: string;
  timezone?: string;
  validAt?: string;
  observedAt?: string;
  temperatureC?: number;
  apparentTemperatureC?: number;
  precipitationProbability?: number;
  windKph?: number;
  europeanAqi?: number;
}

export interface RunningEvidence {
  knowledge?: KnowledgeEvidence;
  weather?: WeatherEvidence;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return (
    value === 'READY' ||
    value === 'NOT_REQUESTED' ||
    value === 'UNAVAILABLE' ||
    value === 'NO_MATCH'
  );
}

export function readKnowledgeEvidence(
  value: unknown
): KnowledgeEvidence | undefined {
  if (!isObject(value) || !isEvidenceStatus(value.status)) return undefined;
  const sources = new Map<string, KnowledgeEvidence['sources'][number]>();
  const rawSources: unknown[] = Array.isArray(value.sources)
    ? value.sources
    : [];
  for (const source of rawSources) {
    if (!isObject(source) || typeof source.title !== 'string') continue;
    const title = source.title.trim();
    if (!title) continue;
    const chapter =
      typeof source.chapter === 'string' ? source.chapter.trim() : '';
    sources.set(JSON.stringify([title, chapter]), {
      title,
      ...(chapter && { chapter }),
    });
  }
  return { status: value.status, sources: Array.from(sources.values()) };
}

const weatherTextFields = [
  'city',
  'timezone',
  'validAt',
  'observedAt',
] as const;
const weatherNumericFields = [
  'temperatureC',
  'apparentTemperatureC',
  'precipitationProbability',
  'windKph',
  'europeanAqi',
] as const;

export function readWeatherEvidence(
  value: unknown
): WeatherEvidence | undefined {
  if (!isObject(value) || !isEvidenceStatus(value.status)) return undefined;
  const weather: WeatherEvidence = { status: value.status };
  for (const key of weatherTextFields) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim()) weather[key] = entry;
  }
  for (const key of weatherNumericFields) {
    const entry = value[key];
    if (typeof entry === 'number' && Number.isFinite(entry))
      weather[key] = entry;
  }
  return weather;
}

export function readRunningEvidence(
  value: unknown
): RunningEvidence | undefined {
  if (!isObject(value)) return undefined;
  const knowledge = readKnowledgeEvidence(value.knowledge);
  const weather = readWeatherEvidence(value.weather);
  if (!knowledge && !weather) return undefined;
  return { ...(knowledge && { knowledge }), ...(weather && { weather }) };
}
