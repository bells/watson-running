import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestRunReview,
  RunReviewError,
  type RunReviewResponse,
} from '../services/runAgentReview';
import type { RunningAdviceContext } from '../services/runAgentEvidence';

type RunReviewState =
  | RunReviewResponse
  | { status: 'LOADING' | 'SUBMITTING' }
  | { status: 'ERROR'; error: RunReviewError };

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 1_500);
    function abort() {
      clearTimeout(timer);
      reject(new RunReviewError('cancelled'));
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function useRunReview(runId: number, accessToken: string | undefined) {
  const [state, setState] = useState<RunReviewState>({ status: 'LOADING' });
  const activeRef = useRef<AbortController | null>(null);

  const request = useCallback(
    async (method: 'GET' | 'POST', adviceContext?: RunningAdviceContext) => {
      if (activeRef.current) return;
      const controller = new AbortController();
      const { signal } = controller;
      activeRef.current = controller;
      try {
        const cutoff = performance.now() + 45_000;
        let result = await requestRunReview(
          runId,
          method,
          accessToken,
          signal,
          undefined,
          adviceContext
        );
        const pendingWeather = result.status === 'GENERATING' && adviceContext;
        if (result.status === 'GENERATING' && !signal.aborted) setState(result);
        while (result.status === 'GENERATING') {
          await waitForPoll(signal);
          const remaining = Math.floor(cutoff - performance.now());
          if (remaining <= 0)
            throw new RunReviewError('timeout', result.requestId);
          result = await requestRunReview(
            runId,
            'GET',
            accessToken,
            signal,
            Math.min(remaining, 10_000)
          );
        }
        if (pendingWeather && result.status === 'READY') {
          const remaining = Math.floor(cutoff - performance.now());
          if (remaining > 0) {
            result = await requestRunReview(
              runId,
              'POST',
              accessToken,
              signal,
              remaining,
              pendingWeather
            );
          }
        }
        if (!signal.aborted) setState(result);
      } catch (error: unknown) {
        if (!signal.aborted)
          setState({
            status: 'ERROR',
            error:
              error instanceof RunReviewError
                ? error
                : new RunReviewError('unavailable'),
          });
      } finally {
        if (activeRef.current === controller) activeRef.current = null;
      }
    },
    [accessToken, runId]
  );

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void request('GET');
    });
    return () => {
      mounted = false;
      activeRef.current?.abort();
      activeRef.current = null;
    };
  }, [request]);

  function start(method: 'GET' | 'POST', adviceContext?: RunningAdviceContext) {
    if (activeRef.current) return;
    setState({ status: method === 'POST' ? 'SUBMITTING' : 'LOADING' });
    void request(method, adviceContext);
  }

  return {
    state,
    generate: (adviceContext?: RunningAdviceContext) =>
      start('POST', adviceContext),
    reload: () => start('GET'),
  };
}
