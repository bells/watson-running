import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connect, Plugin, ResolvedConfig } from 'vite';
import {
  basicRunReviewEvidence,
  type BasicRunReviewEvidence,
} from '../src/core/runReviewEligibility';

const directory = 'run-review-evidence';
const maxSplits = 200;
const distanceTolerance = 10;
const timeTolerance = 2;

interface EvidenceSplit {
  distanceMeters: number;
  movingSeconds: number;
  partial: boolean;
}

interface RunReviewEvidence extends BasicRunReviewEvidence {
  schemaVersion: 1;
  splits: EvidenceSplit[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function positiveSeconds(value: unknown): value is number {
  return positiveFinite(value) && Number.isSafeInteger(value);
}

function evidenceSplits(
  source: unknown,
  distanceMeters: number,
  movingSeconds: number
): EvidenceSplit[] {
  if (!Array.isArray(source) || source.length > maxSplits) return [];

  const splits: EvidenceSplit[] = [];
  let cumulativeDistance = 0;
  let cumulativeSeconds = 0;
  for (const [index, split] of source.entries()) {
    if (!isRecord(split)) return [];
    const {
      distance_m: distance,
      moving_seconds: seconds,
      cumulative_distance_m: sourceDistance,
      cumulative_moving_seconds: sourceSeconds,
      partial,
    } = split;
    if (
      !positiveFinite(distance) ||
      !positiveSeconds(seconds) ||
      !positiveFinite(sourceDistance) ||
      !positiveSeconds(sourceSeconds) ||
      typeof partial !== 'boolean' ||
      (partial
        ? index !== source.length - 1 || distance >= 1000
        : distance < 995 || distance > 1005) ||
      sourceDistance <= cumulativeDistance ||
      sourceSeconds <= cumulativeSeconds
    ) {
      return [];
    }
    // The source rounds quantities independently. Compare cumulative segment
    // sums with only floating-point slack, then apply the whole-run tolerances.
    if (
      Math.abs(sourceDistance - (cumulativeDistance + distance)) > 1e-6 ||
      sourceSeconds !== cumulativeSeconds + seconds
    ) {
      return [];
    }
    cumulativeDistance = sourceDistance;
    cumulativeSeconds = sourceSeconds;
    splits.push({ distanceMeters: distance, movingSeconds: seconds, partial });
  }

  return Math.abs(cumulativeDistance - distanceMeters) <= distanceTolerance &&
    Math.abs(cumulativeSeconds - movingSeconds) <= timeTolerance
    ? splits
    : [];
}

export function projectRunReviewEvidence(
  activity: unknown,
  detail: unknown
): RunReviewEvidence | null {
  const basic = isRecord(activity) ? basicRunReviewEvidence(activity) : null;
  if (!basic) return null;
  if (
    !isRecord(detail) ||
    detail.schema_version !== 1 ||
    detail.run_id !== basic.runId ||
    !positiveFinite(detail.distance_m) ||
    !positiveSeconds(detail.moving_seconds)
  ) {
    return { schemaVersion: 1, ...basic, splits: [] };
  }
  return {
    schemaVersion: 1,
    runId: basic.runId,
    distanceMeters: detail.distance_m,
    movingSeconds: detail.moving_seconds,
    splits: evidenceSplits(
      detail.splits,
      detail.distance_m,
      detail.moving_seconds
    ),
  };
}

async function readOptionalText(filename: string): Promise<string | undefined> {
  try {
    return await readFile(filename, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function loadDetail(publicDir: string, runId: number): Promise<unknown> {
  if (!publicDir) return undefined;
  const text = await readOptionalText(
    path.join(publicDir, 'activity-details', `${runId}.json`)
  );
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function loadActivities(root: string): Promise<unknown[]> {
  const filename = path.resolve(root, 'src/static/activities.json');
  const activities = JSON.parse(await readFile(filename, 'utf8')) as unknown;
  if (!Array.isArray(activities)) {
    throw new Error('Published activity source must be an array');
  }
  return activities;
}

function activityIndex(activities: unknown[]): Map<number, unknown> {
  const byId = new Map<number, unknown>();
  for (const activity of activities) {
    const base = isRecord(activity) ? basicRunReviewEvidence(activity) : null;
    if (!base) continue;
    if (byId.has(base.runId)) {
      throw new Error('Published run IDs must be unique');
    }
    byId.set(base.runId, activity);
  }
  return byId;
}

function evidenceMiddleware(
  base: string,
  lookup: (runId: number) => Promise<string | undefined>
): Connect.NextHandleFunction {
  const folder = `${base.replace(/\/$/, '')}/${directory}`;
  return async (request, response, next) => {
    const requestPath = request.url?.split('?')[0];
    if (requestPath !== folder && !requestPath?.startsWith(`${folder}/`)) {
      next();
      return;
    }
    const match = requestPath
      ?.slice(folder.length + 1)
      .match(/^([1-9][0-9]{0,15})\.json$/);
    const runId = Number(match?.[1]);
    if (!Number.isSafeInteger(runId)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end();
      return;
    }
    try {
      const source = await lookup(runId);
      if (source === undefined) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(request.method === 'HEAD' ? undefined : source);
    } catch {
      response.statusCode = 503;
      response.end();
    }
  };
}

export function runReviewEvidence(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'run-review-evidence',
    configResolved(resolved) {
      config = resolved;
    },
    async generateBundle() {
      const records = activityIndex(await loadActivities(config.root));
      for (const [runId, activity] of records) {
        const detail = await loadDetail(config.publicDir, runId);
        const evidence = projectRunReviewEvidence(activity, detail);
        this.emitFile({
          type: 'asset',
          fileName: `${directory}/${runId}.json`,
          source: JSON.stringify(evidence),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use(
        evidenceMiddleware(config.base, async (runId) => {
          const activity = activityIndex(await loadActivities(config.root)).get(
            runId
          );
          if (!activity) return undefined;
          const detail = await loadDetail(config.publicDir, runId);
          return JSON.stringify(projectRunReviewEvidence(activity, detail));
        })
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        evidenceMiddleware(config.base, (runId) =>
          readOptionalText(
            path.resolve(
              config.root,
              config.build.outDir,
              directory,
              `${runId}.json`
            )
          )
        )
      );
    },
  };
}
