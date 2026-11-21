import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { StatusPanel } from '@core/components/StatusPanel';
import { MAP_HEIGHT } from '../../utils/const';

const RunMap = lazy(() => import('./index'));
const placeholderStyle = { minHeight: `min(${MAP_HEIGHT}px, 55vh)` };

export default function DeferredRunMap(props: ComponentProps<typeof RunMap>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (nearViewport || !containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNearViewport(true);
      },
      { rootMargin: '300px' }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [nearViewport]);

  return (
    <div ref={containerRef} style={nearViewport ? undefined : placeholderStyle}>
      {nearViewport && (
        <Suspense
          fallback={
            <div style={placeholderStyle}>
              <StatusPanel kind="loading" title="正在加载地图…" />
            </div>
          }
        >
          <RunMap {...props} />
        </Suspense>
      )}
    </div>
  );
}
