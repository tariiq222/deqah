'use client';

import { Mail, MessageSquare, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import { Badge } from '@deqah/ui/primitives/badge';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { formatAdminDateTime } from '@/lib/date';
import type { DeliveryLogItem, DeliveryStatus, DeliveryChannel } from './list-delivery-log.api';

interface DeliveryLogTableProps {
  items: DeliveryLogItem[] | undefined;
  isLoading: boolean;
}

// ─── Status dot + label ───────────────────────────────────────────────────────

const STATUS_DOT: Record<DeliveryStatus, string> = {
  SENT: 'bg-success',
  FAILED: 'bg-destructive',
  PENDING: 'bg-warning',
  SKIPPED: 'bg-muted-foreground/40',
};

// TODO i18n: status enum labels Sent / Failed / Pending / Skipped — no matching keys
const STATUS_LABEL: Record<DeliveryStatus, string> = {
  SENT: 'Sent',
  FAILED: 'Failed',
  PENDING: 'Pending',
  SKIPPED: 'Skipped',
};

function StatusCell({ status }: { status: DeliveryStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Channel badge with leading icon ─────────────────────────────────────────

const CHANNEL_ICON: Record<DeliveryChannel, React.ElementType> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  PUSH: Bell,
  IN_APP: Bell,
};

const CHANNEL_CLASS: Record<DeliveryChannel, string> = {
  EMAIL: 'border-primary/30 bg-primary/5 text-primary',
  SMS: 'border-border bg-muted/30 text-foreground',
  PUSH: 'border-border bg-muted/30 text-foreground',
  IN_APP: 'border-border bg-muted/30 text-foreground',
};

function ChannelBadge({ channel }: { channel: DeliveryChannel }) {
  const Icon = CHANNEL_ICON[channel] ?? Bell;
  return (
    <Badge variant="outline" className={`gap-1 ${CHANNEL_CLASS[channel]}`}>
      <Icon size={11} strokeWidth={1.75} />
      <span className="text-[11px]">{channel}</span>
    </Badge>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

const COLUMN_COUNT = 7;

export function DeliveryLogTable({ items, isLoading }: DeliveryLogTableProps) {
  const t = useTranslations('notifications');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.type')}</TableHead>
          <TableHead>{t('table.channel')}</TableHead>
          <TableHead>{t('table.status')}</TableHead>
          <TableHead>{t('table.recipient')}</TableHead>
          <TableHead>{t('table.organization')}</TableHead>
          <TableHead>{t('table.error')}</TableHead>
          {/* TODO i18n: "Time" — no matching key (closest: table.sentAt = "Sent At") */}
          <TableHead className="text-right tabular-nums">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              <TableCell colSpan={COLUMN_COUNT}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))}

        {!isLoading && (!items || items.length === 0) && (
          <TableRow>
            <TableCell
              colSpan={COLUMN_COUNT}
              className="py-10 text-center text-sm text-muted-foreground"
            >
              {t('table.empty')}
            </TableCell>
          </TableRow>
        )}

        {!isLoading &&
          items?.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="font-mono text-[12px] text-foreground">{item.type}</span>
              </TableCell>

              <TableCell>
                <ChannelBadge channel={item.channel} />
              </TableCell>

              <TableCell>
                <StatusCell status={item.status} />
              </TableCell>

              <TableCell>
                <span className="font-mono text-[12px]">{item.toAddress ?? item.recipientId}</span>
              </TableCell>

              <TableCell>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {item.organizationId}
                </span>
              </TableCell>

              <TableCell>
                {item.errorMessage ? (
                  <span
                    className="block max-w-[200px] truncate font-mono text-[11px] text-destructive"
                    title={item.errorMessage}
                  >
                    {item.errorMessage}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              <TableCell className="text-right">
                <span className="font-mono tabular-nums text-[12px] text-muted-foreground">
                  {formatAdminDateTime(item.sentAt ?? item.createdAt)}
                </span>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
