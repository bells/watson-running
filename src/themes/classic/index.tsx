import './styles/index.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Index from './pages/index';
import Total from './pages/total';
import { StatusPanel } from '@core/components/StatusPanel';
import ActivityDetailPage from '@/components/ActivityDetailPage';
import { RunAgentAccessProvider } from './runAgentAccess';
import { runReviewEnabled } from './runReviewRoutes';

const RunReviewSlot = lazy(() => import('./components/RunReviewPanel'));

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
