import { useEffect, useRef, useState } from 'react';

type LookupState = 'idle' | 'pending' | 'error';

export interface DeviceCityControl {
  locate: () => void;
  status: LookupState;
}

async function resolveDeviceCity(signal: AbortSignal): Promise<string> {
  const { coords } = await new Promise<GeolocationPosition>(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 8_000,
      });
    }
  );
  signal.throwIfAborted();
  if (!Number.isFinite(coords.accuracy) || coords.accuracy > 5_000) {
    throw new Error('Device position is too coarse');
  }

  const url = new URL(
    'https://api.bigdatacloud.net/data/reverse-geocode-client'
  );
  url.search = new URLSearchParams({
    latitude: coords.latitude.toFixed(2),
    longitude: coords.longitude.toFixed(2),
    localityLanguage: 'zh',
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('Reverse geocoding failed');
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('lookupSource' in data) ||
    data.lookupSource !== 'reverseGeocoding' ||
    !('city' in data) ||
    typeof data.city !== 'string'
  )
    throw new Error('No city from device coordinates');

  const name = data.city.trim();
  if (!name || name.length > 80) throw new Error('Invalid city name');
  return 'countryCode' in data && data.countryCode === 'CN'
    ? name.replace(/市$/u, '')
    : name;
}

export function useDeviceCity(onLocated: (_city: string) => void) {
  const [status, setStatus] = useState<LookupState>('idle');
  const lookupRef = useRef<AbortController | null>(null);

  useEffect(() => () => lookupRef.current?.abort(), []);

  function cancel() {
    lookupRef.current?.abort();
    lookupRef.current = null;
    setStatus('idle');
  }

  async function locate() {
    if (lookupRef.current) return;
    const controller = new AbortController();
    lookupRef.current = controller;
    setStatus('pending');
    try {
      const city = await resolveDeviceCity(controller.signal);
      if (controller.signal.aborted) return;
      onLocated(city);
      setStatus('idle');
    } catch {
      if (!controller.signal.aborted) setStatus('error');
    } finally {
      if (lookupRef.current === controller) lookupRef.current = null;
    }
  }

  return { locate, cancel, status };
}
