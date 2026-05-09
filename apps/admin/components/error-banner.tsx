'use client';
import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('common');
  const tErrors = useTranslations('errors');

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
        : tErrors('somethingWentWrong');

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/8 px-4 py-3 flex items-start justify-between gap-4"
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertOctagon
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className="text-destructive shrink-0 mt-0.5"
        />
        <p className="text-sm text-destructive/80 leading-snug">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-destructive hover:text-destructive/80 transition-colors shrink-0"
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
}
