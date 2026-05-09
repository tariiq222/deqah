'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { Badge } from '@deqah/ui/primitives/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@deqah/ui/primitives/tooltip';
import { ResetPasswordDialog } from '../reset-user-password/reset-password-dialog';
import type { UserRow } from '../types';

interface Props {
  items: UserRow[] | undefined;
  isLoading: boolean;
}

function Avatar({ name, email }: { name: string; email: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const seed = email.charCodeAt(0) + email.charCodeAt(email.length - 1);
  const hue = (seed * 37) % 360;
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: `hsl(${hue} 55% 45%)` }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

function relativeTime(iso: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return t('table.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('table.timeAgo', { value: m, unit: 'm' });
  const h = Math.floor(m / 60);
  if (h < 24) return t('table.timeAgo', { value: h, unit: 'h' });
  const d = Math.floor(h / 24);
  if (d < 30) return t('table.timeAgo', { value: d, unit: 'd' });
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function UsersTable({ items, isLoading }: Props) {
  const t = useTranslations('users');
  return (
    <TooltipProvider delayDuration={200}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{t('table.name')}</TableHead>
            <TableHead>{t('table.email')}</TableHead>
            <TableHead>{t('table.primaryOrg')}</TableHead>
            <TableHead className="text-right tabular-nums">{t('table.lastSeen')}</TableHead>
            <TableHead className="text-right w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && !items
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            : items?.map((u) => {
                const primaryOrg = u.memberships[0]?.organization;
                return (
                  <TableRow key={u.id}>
                    {/* 24px avatar */}
                    <TableCell className="w-8 pr-0">
                      <Avatar name={u.name} email={u.email} />
                    </TableCell>

                    {/* Name + super-admin badge */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium leading-tight">{u.name}</span>
                        {u.isSuperAdmin ? (
                          <Badge
                            variant="outline"
                            className="border-primary/40 bg-primary/10 text-primary text-[10px] px-1 py-0"
                          >
                            {t('table.superAdmin')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>

                    {/* Email — mono 12px */}
                    <TableCell>
                      <span className="font-mono text-[12px] text-muted-foreground">{u.email}</span>
                    </TableCell>

                    {/* Primary org */}
                    <TableCell>
                      {primaryOrg ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[13px] cursor-default">{primaryOrg.nameEn ?? primaryOrg.nameAr}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <span className="font-mono text-[11px]">{primaryOrg.id}</span>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Last seen — createdAt as proxy; mono timestamp */}
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="tabular-nums text-[12px] text-muted-foreground cursor-default">
                            {relativeTime(u.createdAt, t)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <span className="font-mono text-[11px]">
                            {new Date(u.createdAt).toLocaleString('en-GB')}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <ResetPasswordDialog userId={u.id} userEmail={u.email} />
                    </TableCell>
                  </TableRow>
                );
              })}
          {!isLoading && items?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                {t('table.empty')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
