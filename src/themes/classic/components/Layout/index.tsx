import React, { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '../Header';
import getSiteMetadata from '@core/hooks/useSiteMetadata';
import { publicRunAgentEnabled } from '../../runReviewRoutes';

const privateChat = import.meta.env.VITE_RUN_AGENT_PRIVATE_CHAT === 'true';
const privateTraining =
  privateChat && import.meta.env.VITE_RUN_AGENT_PRIVATE_TRAINING === 'true';
const ChatAssistant =
  import.meta.env.DEV || privateChat || publicRunAgentEnabled
    ? lazy(() => import('../ChatAssistant'))
    : null;

const Layout = ({
  children,
  trainingThrough,
}: React.PropsWithChildren<{ trainingThrough?: string }>) => {
  const { siteTitle, description } = getSiteMetadata();

  return (
    <>
      <Helmet>
        <html lang="zh-CN" />
        <title>{siteTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content="running" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
      </Helmet>
      <Header />
      {ChatAssistant && (
        <Suspense fallback={null}>
          <ChatAssistant
            privateChat={privateChat}
            privateTraining={privateTraining}
            publicApi={publicRunAgentEnabled}
            trainingThrough={trainingThrough}
          />
        </Suspense>
      )}
      <div className="mx-auto mb-16 max-w-screen-2xl p-4 lg:px-16 lg:py-8">
        {children}
      </div>
    </>
  );
};

export default Layout;
