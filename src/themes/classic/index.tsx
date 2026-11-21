import './styles/index.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Index from './pages/index';
import { StatusPanel } from '@core/components/StatusPanel';
import { RunAgentAccessProvider } from './runAgentAccess';
import { runReviewEnabled } from './runReviewRoutes';

const RunReviewSlot = lazy(() => import('./components/RunReviewPanel'));
const Total = lazy(() => import('./pages/total'));
const ActivityDetailPage = lazy(
  () => import('@/components/ActivityDetailPage')
);
const fontStylesheet =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&family=IBM+Plex+Sans:ital,wght@0,100..700;1,100..700&display=swap';

function reviewForRun(runId: number) {
  return (
    <Suspense fallback={null}>
      <RunReviewSlot runId={runId} />
    </Suspense>
  );
}

function ClassicActivityDetail() {
  const { runId } = useParams();
  return (
    <ActivityDetailPage
      key={runId}
      renderReview={runReviewEnabled ? reviewForRun : undefined}
    />
  );
}

export default function ClassicTheme() {
  return (
    <HelmetProvider>
      {/* Use system fonts until this optional stylesheet has loaded. */}
      <link
        rel="stylesheet"
        href={fontStylesheet}
        media="print"
        onLoad={({ currentTarget }) => {
          currentTarget.media = 'all';
        }}
      />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense
          fallback={<StatusPanel kind="loading" title="正在加载运动记录…" />}
        >
          <RunAgentAccessProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/summary" element={<Total />} />
              <Route
                path="/activity/:runId"
                element={<ClassicActivityDetail />}
              />
              <Route path="*" element={<Index />} />
            </Routes>
          </RunAgentAccessProvider>
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  );
}
