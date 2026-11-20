import { useEffect, useRef, useState } from 'react';
import {
  requestTrainingStats,
  TrainingError,
  type TrainingRequest,
  type TrainingResponse,
} from '../services/runAgentTraining';

type QueryState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; result: TrainingResponse }
  | { status: 'failure'; request: TrainingRequest; error: TrainingError };

export function useTrainingStats(accessToken: string | undefined) {
  const [state, setState] = useState<QueryState>({ status: 'idle' });
  const activeRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeRef.current?.abort();
      activeRef.current = null;
    },
    []
  );

  function reset() {
    const request = activeRef.current;
    activeRef.current = null;
    request?.abort();
    setState({ status: 'idle' });
  }

  async function query(request: TrainingRequest) {
    if (activeRef.current) return;
    const controller = new AbortController();
    activeRef.current = controller;
    setState({ status: 'pending' });
    try {
      const result = await requestTrainingStats(
        request,
        accessToken,
        controller.signal
      );
      if (activeRef.current === controller)
        setState({ status: 'success', result });
    } catch (failure: unknown) {
      if (activeRef.current !== controller) return;
      const error =
        failure instanceof TrainingError
          ? failure
          : new TrainingError('network');
      setState({ status: 'failure', request, error });
    } finally {
      if (activeRef.current === controller) activeRef.current = null;
    }
  }

  return { query, reset, state };
}
