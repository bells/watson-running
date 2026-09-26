import './styles/index.css';
import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Index from './pages/index';
import Total from './pages/total';
import ActivityDetailPage from '@/components/ActivityDetailPage';

export default function ClassicTheme() {
  return (
    <HelmetProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/summary" element={<Total />} />
            <Route path="/activity/:runId" element={<ActivityDetailPage />} />
            <Route path="*" element={<Index />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  );
}
