import { useEffect, useState } from 'react';

async function findVisitorCity(signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch('/api/visitor-city', {
      signal,
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (data && typeof data === 'object' && 'city' in data) {
      const city = typeof data.city === 'string' ? data.city.trim() : '';
      if (city && city.length <= 80) return city;
    }
  } catch {
    // Keep city entry available on static hosts and when lookup fails.
  }
  return null;
}

export function useSuggestedCity(enabled: boolean) {
  const [city, setCity] = useState<string | null>();

  useEffect(() => {
    if (!enabled || city !== undefined) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setCity(null);
    }, 3_000);
    void findVisitorCity(controller.signal).then((result) => {
      window.clearTimeout(timeout);
      if (!controller.signal.aborted) setCity(result);
    });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, city]);

  return city;
}
