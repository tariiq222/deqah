'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';
import { OrgBillingDetail } from '@/features/billing/get-org-billing/org-billing-detail';
import { Breadcrumbs } from '@/components/breadcrumbs';

export default function OrgBillingPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Organization billing</h2>
          <p className="text-sm text-muted-foreground font-mono">{orgId}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/billing">← Back to subscriptions</Link>
        </Button>
      </div>
      <OrgBillingDetail orgId={orgId} />
    </div>
  );
}
