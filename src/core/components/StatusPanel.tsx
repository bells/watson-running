import type { ReactNode } from 'react';
import styles from './StatusPanel.module.css';

type StatusKind = 'loading' | 'empty' | 'error' | 'map';

interface StatusPanelProps {
  kind: StatusKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
}

export function StatusPanel({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
  children,
}: StatusPanelProps) {
  return (
    <section
      className={`${styles.panel} ${styles[kind]} ${className}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-busy={kind === 'loading'}
    >
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {children}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}
