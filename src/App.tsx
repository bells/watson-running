import {
  lazy,
  type LazyExoticComponent,
  type ComponentType,
  Suspense,
} from 'react';
import { LocaleProvider } from './hooks/useLocale';
import { THEME_PRESET } from './config';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StatusPanel } from './core/components/StatusPanel';

// 主题注册表 — 新增主题时在此处注册，并在 src/themes/ 下创建对应文件夹
const themes: Record<string, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(() => import('./themes/dashboard')),
  classic: lazy(() => import('./themes/classic')),
  // 在此处添加自定义主题，例如：
  // 'my-theme': lazy(() => import('./themes/my-theme')),
};

const ThemeComponent = themes[THEME_PRESET] ?? themes['dashboard'];

export default function App() {
  return (
    <LocaleProvider>
      <ErrorBoundary>
        <Suspense
          fallback={
            <main className="flex min-h-screen items-center justify-center bg-[var(--running-surface)] p-6">
              <StatusPanel kind="loading" title="正在加载跑步记录…" />
            </main>
          }
        >
          <ThemeComponent />
        </Suspense>
      </ErrorBoundary>
    </LocaleProvider>
  );
}
