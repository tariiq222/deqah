'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { Button } from '@deqah/ui/primitives/button';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@deqah/ui/primitives/tooltip';
import { useEndImpersonation } from '../end-impersonation/use-end-impersonation';
import type { ImpersonationSession } from '../types';

interface Props {
  items: ImpersonationSession[] | undefined;
  isLoading: boolean;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function monoTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB');
}

function durationLabel(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = end - new Date(startedAt).getTime();
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return `${totalSecs}s`;
}

interface SessionRowProps {
  session: ImpersonationSession;
  active: boolean;
  endMutation: ReturnType<typeof useEndImpersonation>;
}

function SessionRow({ session: s, active, endMutation }: SessionRowProps) {
  const t = useTranslations('impersonation');

  return (
    <TableRow key={s.id}>
      {/* Status dot */}
      <TableCell className="w-6 pr-0">
        {active ? (
          <span
            className="inline-block size-1.5 rounded-full bg-primary animate-pulse"
            aria-label={t('table.activeDot')}
          />
        ) : (
          <span className="inline-block size-1.5 rounded-full bg-muted-foreground/30" />
        )}
      </TableCell>

      {/* Actor */}
      <TableCell>
        <span className="font-mono text-[12px]">{s.superAdminUserId}</span>
      </TableCell>

      {/* Target */}
      <TableCell>
        <span className="font-mono text-[12px]">{s.targetUserId}</span>
      </TableCell>

      {/* Org */}
      <TableCell>
        <span className="font-mono text-[12px]">{s.organizationId}</span>
      </TableCell>

      {/* Started */}
      <TableCell>
        <span className="font-mono tabular-nums text-[12px] text-muted-foreground">
          {monoTimestamp(s.startedAt)}
        </span>
      </TableCell>

      {/* Ended */}
      <TableCell>
        <span className="font-mono tabular-nums text-[12px] text-muted-foreground">
          {monoTimestamp(s.endedAt)}
        </span>
      </TableCell>

      {/* Duration */}
      <TableCell>
        <span className="tabular-nums text-[12px] text-muted-foreground">
          {durationLabel(s.startedAt, s.endedAt)}
        </span>
      </TableCell>

      {/* End action */}
      <TableCell className="text-right">
        {active ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={endMutation.isPending}
                  onClick={() => endMutation.mutate(s.id)}
                  aria-label={t('table.endSessionAriaLabel')}
                >
                  <LogOut size={14} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{t('table.endSession')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

const TABLE_COLS = 8;

export function SessionsTable({ items, isLoading }: Props) {
  const endMutation = useEndImpersonation();
  const now = useNow();

  const activeSessions = items?.filter((s) => {
    const expired = new Date(s.expiresAt).getTime() <= now;
    return !s.endedAt && !expired;
  }) ?? [];

  const pastSessions = items?.filter((s) => {
    const expired = new Date(s.expiresAt).getTime() <= now;
    return s.endedAt !== null || expired;
  }) ?? [];

  const t = useTranslations('impersonation');

  const colHeaders = (
    <TableRow>
      <TableHead className="w-6" />
      <TableHead>{t('table.actor')}</TableHead>
      <TableHead>{t('table.targetUser')}</TableHead>
      <TableHead>{t('table.organization')}</TableHead>
      <TableHead>{t('table.started')}</TableHead>
      <TableHead>{t('table.ended')}</TableHead>
      <TableHead>{t('table.duration')}</TableHead>
      <TableHead className="text-right w-16" />
    </TableRow>
  );

  if (isLoading && !items) {
    return (
      <Table>
        <TableHeader>{colHeaders}</TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={`skeleton-${i}`}>
              <TableCell colSpan={TABLE_COLS}>
                <Skeleton className="h-5" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active now section */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {t('sections.activeNow')}
        </p>
        <div className="border-t border-border">
          <Table>
            <TableHeader>{colHeaders}</TableHeader>
            <TableBody>
              {activeSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLS} className="py-6 text-center text-sm text-muted-foreground">
                    {t('empty.noActiveSessions')}
                  </TableCell>
                </TableRow>
              ) : (
                activeSessions.map((s) => (
                  <SessionRow key={s.id} session={s} active={true} endMutation={endMutation} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Past sessions section */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {t('sections.pastSessions')}
        </p>
        <div className="border-t border-border">
          <Table>
            <TableHeader>{colHeaders}</TableHeader>
            <TableBody>
              {pastSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLS} className="py-6 text-center text-sm text-muted-foreground">
                    {t('empty.noPastSessions')}
                  </TableCell>
                </TableRow>
              ) : (
                pastSessions.map((s) => (
                  <SessionRow key={s.id} session={s} active={false} endMutation={endMutation} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
