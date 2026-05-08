'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@deqah/ui/primitives/badge';
import { Button } from '@deqah/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@deqah/ui/primitives/card';
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
  const locale = useLocale();
  const dateLocale = locale === 'ar' ? 'ar-SA' : 'en-GB';
  const [updateOpen, setUpdateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { data, isLoading, error } = useGetOrganization(id);
  const { data: billing } = useGetOrgBilling(id);

  if (isLoading || !data) return <Skeleton className="h-48" />;
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {errorT('loadFailed', { message: (error as Error).message })}
      </div>
    );
  }

  const archived = data.status === 'ARCHIVED';
  const suspended = data.status === 'SUSPENDED';
  const hasSuspensionDetail = Boolean(data.suspendedAt);
  const sub = billing?.subscription ?? null;

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      <div className="flex items-start justify-between">
        <div>
          <Link href="/organizations" className="text-xs text-muted-foreground hover:underline">
            {t('back')}
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">{data.nameAr}</h2>
          {data.nameEn ? <p className="text-sm text-muted-foreground">{data.nameEn}</p> : null}
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{data.slug}</span>
            <OrgStatusBadge status={data.status} label={statusT(data.status)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setUpdateOpen(true)}>
            {t('edit')}
          </Button>
          {!archived && !hasSuspensionDetail ? (
            <ImpersonateDialog organizationId={id} organizationName={data.nameAr} />
          ) : null}
          {!archived && suspended ? (
            <ReinstateDialog organizationId={id} />
          ) : !archived ? (
            <SuspendDialog organizationId={id} />
          ) : null}
          {!archived ? (
            <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
              {t('archive')}
            </Button>
          ) : null}
        </div>
      </div>

      {hasSuspensionDetail ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 text-sm">
            <strong>{statusT(data.status)}</strong>{' '}
            {t('suspendedSince', {
              date: new Date(data.suspendedAt!).toLocaleString(dateLocale),
            })}{' '}
            {data.suspendedReason ? <em>{t('reason', { reason: data.suspendedReason })}</em> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label={t('members')} value={data.stats.memberCount} />
        <StatCard label={t('bookings30d')} value={data.stats.bookingCount30d} />
        <StatCard
          label={t('totalRevenue')}
          value={Number(data.stats.totalRevenue).toLocaleString()}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{t('subscription')}</CardTitle>
          {sub && !archived ? (
            <ChangePlanDialog orgId={id} currentPlanId={sub.planId} />
          ) : null}
        </CardHeader>
        <CardContent>
          {!sub ? (
            <p className="text-sm text-muted-foreground">{t('noSubscription')}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('plan')}</dt>
                <dd className="mt-0.5 font-medium">
                  {sub.plan.slug}
                  <span className="ms-1 text-xs text-muted-foreground">({sub.plan.nameEn})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('status')}</dt>
                <dd className="mt-0.5">
                  <SubStatusBadge status={sub.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('cycle')}</dt>
                <dd className="mt-0.5">{sub.billingCycle}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('periodStart')}
                </dt>
                <dd className="mt-0.5">
                  {new Date(sub.currentPeriodStart).toLocaleDateString(dateLocale)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('periodEnd')}
                </dt>
                <dd className="mt-0.5">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString(dateLocale)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('monthlyPrice')}
                </dt>
                <dd className="mt-0.5">
                  {t('priceSar', { amount: Number(sub.plan.priceMonthly).toLocaleString() })}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
      <UpdateOrganizationDialog open={updateOpen} onOpenChange={setUpdateOpen} organization={data} />
      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        organizationId={id}
        organizationName={data.nameAr}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}

function OrgStatusBadge({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    TRIALING: 'border-primary/40 bg-primary/10 text-primary',
    ACTIVE: 'border-success/40 bg-success/10 text-success',
    PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
    SUSPENDED: 'border-warning/40 bg-warning/10 text-warning',
    ARCHIVED: 'border-muted/40 bg-muted/10 text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={map[status] ?? 'border-border bg-muted/10'}>
      {label}
    </Badge>
  );
}

function SubStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'border-success/40 bg-success/10 text-success',
    TRIALING: 'border-primary/40 bg-primary/10 text-primary',
    PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
    SUSPENDED: 'border-destructive/40 bg-destructive/10 text-destructive',
    CANCELED: 'border-muted/40 bg-muted/10 text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={map[status] ?? 'border-border bg-muted/10'}>
      {status}
    </Badge>
  );
}
