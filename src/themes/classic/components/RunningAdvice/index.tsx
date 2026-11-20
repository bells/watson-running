import type { RunningEvidence } from '@core/services/runAgentEvidence';
import styles from './style.module.css';

export interface RunningLocation {
  city: string;
  runningAt: string;
}

export const emptyRunningLocation: RunningLocation = {
  city: '',
  runningAt: '',
};

export function RunningLocationFields({
  location,
  onChange,
  disabled,
}: {
  location: RunningLocation;
  onChange: (_location: RunningLocation) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.location}>
      <label>
        出跑城市
        <input
          type="text"
          autoComplete="off"
          placeholder="例如上海"
          maxLength={80}
          value={location.city}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...location, city: event.target.value })
          }
        />
      </label>
      <label>
        当地开跑时间（选填）
        <input
          type="datetime-local"
          value={location.runningAt}
          disabled={disabled || !location.city.trim()}
          onChange={(event) =>
            onChange({ ...location, runningAt: event.target.value })
          }
        />
      </label>
    </div>
  );
}

export function RunningEvidenceDetails({
  evidence,
}: {
  evidence?: RunningEvidence;
}) {
  const { knowledge, weather } = evidence ?? {};
  const showKnowledge = knowledge && knowledge.status !== 'NOT_REQUESTED';
  const showWeather = weather && weather.status !== 'NOT_REQUESTED';
  if (!showKnowledge && !showWeather) return null;

  const weatherMetrics = [
    ['气温', weather?.temperatureC, ' °C'],
    ['体感', weather?.apparentTemperatureC, ' °C'],
    ['降水概率', weather?.precipitationProbability, '%'],
    ['风速', weather?.windKph, ' km/h'],
    ['欧洲空气质量指数', weather?.europeanAqi, ''],
  ] as const;

  return (
    <aside className={styles.evidence} aria-label="回答依据">
      {showKnowledge && (
        <div>
          <strong>书籍来源</strong>
          {knowledge.status === 'READY' && knowledge.sources.length ? (
            <ul>
              {knowledge.sources.map(({ title, chapter }) => (
                <li key={JSON.stringify([title, chapter ?? ''])}>
                  《{title}》{chapter ? ` · ${chapter}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {knowledge.status === 'NO_MATCH'
                ? '书库暂无匹配依据。'
                : '暂时无法取得书籍依据。'}
            </p>
          )}
        </div>
      )}
      {showWeather && (
        <div>
          <strong>天气依据</strong>
          {weather.status === 'READY' ? (
            <>
              <p>
                {[
                  weather.city,
                  weather.validAt?.replace('T', ' '),
                  weather.timezone,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <dl className={styles.metrics}>
                {weatherMetrics.map(([label, value, unit]) =>
                  value === undefined ? null : (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {value}
                        {unit}
                      </dd>
                    </div>
                  )
                )}
              </dl>
              <p>
                天气数据来自{' '}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open-Meteo
                </a>
              </p>
            </>
          ) : (
            <p>
              {weather.status === 'NO_MATCH'
                ? '没有对应地点或时段的天气。'
                : '天气暂不可用。'}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
