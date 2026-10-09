import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resetActivityData } from '../hooks/useActivities';
import { StatusPanel } from '../core/components/StatusPanel';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time errors thrown by descendants (e.g. the Suspense data
 * source throwing a fetch error instead of a promise) so a failed
 * activities.json load degrades gracefully instead of blanking the page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error);
  }

  private handleRetry = () => {
    resetActivityData();
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[var(--running-surface)] p-6">
          <StatusPanel
            kind="error"
            title="跑步记录加载失败"
            description={this.state.message}
            actionLabel="重试加载"
            onAction={this.handleRetry}
          />
        </main>
      );
    }
    return this.props.children;
  }
}
