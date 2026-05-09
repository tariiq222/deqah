'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import { useListZohoSaasInvoices } from '@/features/billing/list-zoho-saas-invoices/use-list-zoho-saas-invoices';
import { ZohoInvoicesTable } from '@/features/billing/list-zoho-saas-invoices/zoho-invoices-table';

type StatusFilter = 'all' | 'PAID' | 'DUE' | 'FAILED' | 'VOID';
type MirroredFilter = 'all' | 'yes' | 'no';

export default function BillingZohoSchedulePage() {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [mirrored, setMirrored] = useState<MirroredFilter>('all');
  const [organizationId, setOrganizationId] = useState('');

  const { data, isLoading, error } = useListZohoSaasInvoices({
    page,
    perPage: 25,
    status: status === 'all' ? undefined : status,
    organizationId: organizationId.trim() || undefined,
    zohoMirrored: mirrored === 'all' ? undefined : mirrored,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        {/* TODO i18n: Zoho — Invoice schedule (no billing.zoho* key) */}
        <h2 className="text-xl font-semibold">Zoho — Invoice schedule</h2>
        <p className="text-sm text-muted-foreground">
          {/* TODO i18n: SaaS subscription invoices and their mirror status in the platform Zoho organization. */}
          SaaS subscription invoices and their mirror status in the platform Zoho organization.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Failed to load: {(error as Error).message}
        </p>
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {tc('status')}
          </Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={tc('status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc('all')}</SelectItem>
              <SelectItem value="PAID">{t('invoiceStatus.PAID')}</SelectItem>
              <SelectItem value="DUE">{t('invoiceStatus.DUE')}</SelectItem>
              <SelectItem value="FAILED">{t('invoiceStatus.FAILED')}</SelectItem>
              <SelectItem value="VOID">{t('invoiceStatus.VOID')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {/* TODO i18n: Zoho mirror */}
            Zoho mirror
          </Label>
          <Select
            value={mirrored}
            onValueChange={(v) => {
              setMirrored(v as MirroredFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Mirror" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc('all')}</SelectItem>
              <SelectItem value="yes">{/* TODO i18n: Mirrored only */}Mirrored only</SelectItem>
              <SelectItem value="no">{/* TODO i18n: Not mirrored */}Not mirrored</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {t('filters.organizationId')}
          </Label>
          <Input
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
              setPage(1);
            }}
            placeholder="org-uuid"
            className="w-[240px] font-mono text-xs"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStatus('all');
            setMirrored('all');
            setOrganizationId('');
            setPage(1);
          }}
        >
          {tc('reset')}
        </Button>
      </div>

      <ZohoInvoicesTable items={data?.items} isLoading={isLoading} />

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {tc('page')} {data.meta.page} {tc('of')} {data.meta.totalPages} · {data.meta.total} {tc('total')}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {tc('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {tc('next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
