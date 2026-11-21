import { useEffect, useRef, useState } from 'react';

type PositionFailure =
  | 'permission-denied'
  | 'position-unavailable'
  | 'position-timeout'
  | 'position-coarse';
type LookupState = 'idle' | 'pending' | PositionFailure | 'city-unavailable';

export interface DeviceCityControl {
  locate: () => void;
  status: LookupState;
}

class DevicePositionError extends Error {
  constructor(readonly reason: PositionFailure) {
    super(reason);
  }
}

const positionFailures: Partial<Record<number, PositionFailure>> = {
  1: 'permission-denied',
  3: 'position-timeout',
};

async function resolveDeviceCity(signal: AbortSignal): Promise<string> {
  if (!navigator.geolocation)
    throw new DevicePositionError('position-unavailable');
  const { coords } = await new Promise<GeolocationPosition>(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        ({ code }) =>
          reject(
            new DevicePositionError(
              positionFailures[code] ?? 'position-unavailable'
            )
          ),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8_000 }
      );
    }
  );
  signal.throwIfAborted();
  if (!Number.isFinite(coords.accuracy) || coords.accuracy > 5_000) {
    throw new DevicePositionError('position-coarse');
  }

  const latitude = coords.latitude.toFixed(2);
  const longitude = coords.longitude.toFixed(2);
  const url = new URL(
    'https://api.bigdatacloud.net/data/reverse-geocode-client'
  );
  url.search = new URLSearchParams({
    latitude,
    longitude,
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
    !('city' in data) ||
    typeof data.city !== 'string'
  )
    throw new Error('No city from device coordinates');

  // Older responses echo the requested coordinates without a source field.
  const fromCoordinates =
    'lookupSource' in data
      ? data.lookupSource === 'coordinates' ||
        data.lookupSource === 'reverseGeocoding'
      : 'latitude' in data &&
        data.latitude === Number(latitude) &&
        'longitude' in data &&
        data.longitude === Number(longitude);
  if (!fromCoordinates)
    throw new Error('City did not come from device coordinates');

  const name = data.city.trim();
  if (!name || name.length > 80) throw new Error('Invalid city name');
  return 'countryCode' in data && data.countryCode === 'CN'
    ? name.replace(/市$/u, '')
    : name;
}

async function canUseDeviceLocation() {
  try {
    const permission = await navigator.permissions?.query({
      name: 'geolocation',
    });
    return permission?.state === 'granted';
  } catch {
    return false;
  }
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

  async function lookup(onlyIfGranted: boolean) {
    if (lookupRef.current) return;
    const controller = new AbortController();
    lookupRef.current = controller;
    try {
      if (onlyIfGranted && !(await canUseDeviceLocation())) return;
      if (controller.signal.aborted) return;
      setStatus('pending');
      const city = await resolveDeviceCity(controller.signal);
      if (controller.signal.aborted) return;
      onLocated(city);
      setStatus('idle');
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus(
          error instanceof DevicePositionError
            ? error.reason
            : 'city-unavailable'
        );
      }
    } finally {
      if (lookupRef.current === controller) lookupRef.current = null;
    }
  }

  return {
    locate: () => void lookup(false),
    locateIfGranted: () => void lookup(true),
    cancel,
    status,
  };
}
