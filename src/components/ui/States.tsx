import React from 'react';
import { AlertTriangle, Inbox, Loader2, PlugZap, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

/** Shown while a page or panel loads. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-ink-muted"
    >
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      {label}
    </div>
  );
}

/** Nothing here yet, with the action that fills it. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="rounded-full bg-surface-muted p-3 text-ink-muted" aria-hidden="true">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

/** Something failed; says what and offers a retry when one makes sense. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-rose-300 bg-danger-50 p-4 text-rose-900 sm:flex-row sm:items-center sm:justify-between dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="text-sm">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** A feature that needs a service this deployment does not have. */
export function NotConnected({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div
      data-testid="not-connected"
      className="flex flex-col gap-3 rounded-card border border-amber-300 bg-warning-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <PlugZap className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="text-sm">{message}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
