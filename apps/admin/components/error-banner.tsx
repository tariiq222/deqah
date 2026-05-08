'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export function ErrorBanner({
  error,
  onRetry,
  context,
}: {
  error: Error | string | unknown;
  onRetry?: () => void;
  context?: string;
}) {
  useEffect(() => {
    if (error instanceof Error) {
      Sentry.captureException(error, { tags: { context: context ?? 'unknown' } });
    }
  }, [error, context]);

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-center justify-between gap-4"
    >
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-destructive hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
