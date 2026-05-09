'use client';

import { use } from 'react';
import Link from 'next/link';
import { OrgBillingDetail } from '@/features/billing/get-org-billing/org-billing-detail';

export default function OrgBillingPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {/* TODO i18n: Tenant billing */}
            Tenant billing
          </p>
          <h2 className="text-xl font-semibold">
            <span className="font-mono text-sm text-muted-foreground">{orgId}</span>
          </h2>
        </div>
        <Link
          href="/billing"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {/* TODO i18n: ← Subscriptions */}← Subscriptions
        </Link>
      </div>

      <OrgBillingDetail orgId={orgId} />
    </div>
  );
}
