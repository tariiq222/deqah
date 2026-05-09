'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { Button } from '@deqah/ui/primitives/button';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { useGetOrganization } from '@/features/organizations/get-organization/use-get-organization';
import { useGetOrgBilling } from '@/features/organizations/get-org-billing/use-get-org-billing';
import { SuspendDialog } from '@/features/organizations/suspend-organization/suspend-dialog';
import { ReinstateDialog } from '@/features/organizations/reinstate-organization/reinstate-dialog';
import { ImpersonateDialog } from '@/features/impersonation/start-impersonation/impersonate-dialog';
import { ChangePlanDialog } from '@/features/organizations/change-plan/change-plan-dialog';
import { ArchiveDialog } from '@/features/organizations/archive-organization/archive-dialog';
import { UpdateOrganizationDialog } from '@/features/organizations/update-organization/update-organization-dialog';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { formatSar } from '@/lib/currency';

const STATUS_DOT: Record<string, string> = {
  TRIALING: 'bg-primary',
  ACTIVE: 'bg-success',
  PAST_DUE: 'bg-warning',
  SUSPENDED: 'bg-warning',
  ARCHIVED: 'bg-muted-foreground',
};

function StatusDot({ status, label }: { status: string; label: string }) {
  const dot = STATUS_DOT[status] ?? 'bg-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function KpiRow({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <div className="flex divide-x divide-border overflow-hidden rounded-md border border-border">
      {items.map(({ label, value }) => (
        <div key={label} className="px-5 py-3 first:ps-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-[24px] font-semibold leading-none tabular">{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const t = useTranslations('organizations.detail');
  const statusT = useTranslations('organizations.status');
  const errorT = useTranslations('organizations.error');
  const tc = useTranslations('common');
  const locale = useLocale();
  const dateLocale = locale === 'ar' ? 'ar-SA' : 'en-GB';
  const [updateOpen, setUpdateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data, isLoading, error } = useGetOrganization(id);
  const { data: billing } = useGetOrgBilling(id);

  if (isLoading || !data) return <Skeleton className="h-48" />;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {errorT('loadFailed', { message: (error as Error).message })}
      </p>
    );
  }

  const archived = data.status === 'ARCHIVED';
  const suspended = data.status === 'SUSPENDED';
  const hasSuspensionDetail = Boolean(data.suspendedAt);
  const sub = billing?.subscription ?? null;

  function copyId() {
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-8">
      <Breadcrumbs pathname={pathname} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/organizations"
            className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground"
          >
            {t('back')}
          </Link>
          <h1 className="mt-2 text-[28px] font-medium leading-tight tracking-tight">
            {data.nameAr}
          </h1>
          {data.nameEn ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{data.nameEn}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="mono text-xs">{data.slug}</span>
              <button
                onClick={copyId}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2"
                aria-label={tc('copy')}
              >
                <Copy className="size-3" strokeWidth={1.75} />
              </button>
              {copied ? <span className="mono text-[10px] text-success">{tc('copied')}</span> : null}
            </span>
            <StatusDot status={data.status} label={statusT(data.status)} />
          </div>
        </div>

        {/* Action row */}
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => setUpdateOpen(true)}>
            {t('edit')}
          </Button>
          {!archived && !hasSuspensionDetail ? (
            <ImpersonateDialog organizationId={id} organizationName={data.nameAr} />
          ) : null}
          {!archived && suspended ? (
            <ReinstateDialog organizationId={id} organizationName={data.nameAr} />
          ) : !archived ? (
            <SuspendDialog organizationId={id} organizationName={data.nameAr} />
          ) : null}
          {!archived ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              {t('archive')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Suspension notice */}
      {hasSuspensionDetail ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          <span>
            <strong>{statusT(data.status)}</strong>{' '}
            {t('suspendedSince', {
              date: new Date(data.suspendedAt!).toLocaleString(dateLocale),
            })}
            {data.suspendedReason
              ? ` — ${t('reason', { reason: data.suspendedReason })}`
              : null}
          </span>
        </div>
      ) : null}

      {/* KPI strip */}
      <KpiRow
        items={[
          { label: t('members'), value: data.stats.memberCount },
          { label: t('bookings30d'), value: data.stats.bookingCount30d },
          { label: t('totalRevenue'), value: formatSar(data.stats.totalRevenue) },
        ]}
      />

      {/* Subscription */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t('subscription')}
          </h2>
          {sub && !archived ? (
            <ChangePlanDialog orgId={id} currentPlanId={sub.planId} />
          ) : null}
        </div>

        {!sub ? (
          <p className="text-sm text-muted-foreground">{t('noSubscription')}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t('plan')}
              </dt>
              <dd className="mono mt-1 text-sm font-medium">
                {sub.plan.slug}
                <span className="ms-1 font-normal text-muted-foreground">({sub.plan.nameEn})</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t('status')}
              </dt>
              <dd className="mt-1">
                <StatusDot status={sub.status} label={sub.status} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t('cycle')}
              </dt>
              <dd className="mt-1 text-sm">{sub.billingCycle}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t('periodStart')}
              </dt>
              <dd className="tabular mt-1 text-sm">
                {new Date(sub.currentPeriodStart).toLocaleDateString(dateLocale)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t('periodEnd')}
              </dt>
              <dd className="tabular mt-1 text-sm">
                {new Date(sub.currentPeriodEnd).toLocaleDateString(dateLocale)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t('monthlyPrice')}
              </dt>
              <dd className="tabular mt-1 text-sm font-medium">
                {formatSar(sub.plan.priceMonthly)}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <UpdateOrganizationDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        organization={data}
      />
      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        organizationId={id}
        organizationName={data.nameAr}
      />
    </div>
  );
}
