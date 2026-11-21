import { useId } from 'react';
import type { RunningEvidence } from '@core/services/runAgentEvidence';
import type { DeviceCityControl } from './useDeviceCity';
import styles from './style.module.css';

const deviceLocationMessages: Partial<
  Record<DeviceCityControl['status'], string>
> = {
  'permission-denied':
    '定位权限未开启，请在浏览器的网站设置中允许定位，或手动填写城市。',
  'position-unavailable':
    '浏览器暂时无法取得设备位置，请检查系统定位设置或手动填写城市。',
  'position-timeout': '获取设备位置超时，可重试或手动填写城市。',
  'position-coarse': '设备定位精度不足，可手动填写城市。',
  'city-unavailable': '已取得设备位置，但城市查询失败。可重试或手动填写。',
};

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
  deviceCity,
}: {
  location: RunningLocation;
  onChange: (_location: RunningLocation) => void;
  disabled?: boolean;
  deviceCity?: DeviceCityControl;
}) {
  const devicePrivacyId = useId();
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
      {deviceCity && (
        <div className={styles.deviceLocation}>
          <button
            type="button"
            className={styles.locate}
            onClick={deviceCity.locate}
            disabled={disabled || deviceCity.status === 'pending'}
            aria-describedby={devicePrivacyId}
          >
            {deviceCity.status === 'pending' ? '正在定位…' : '使用设备定位'}
          </button>
          <small id={devicePrivacyId}>
            将公里级坐标发送给 BigDataCloud 查询城市。
          </small>
          <p role="status">{deviceLocationMessages[deviceCity.status]}</p>
        </div>
      )}
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
