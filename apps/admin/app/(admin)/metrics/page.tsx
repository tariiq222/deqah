'use client';

import { usePathname } from 'next/navigation';
import { MetricsGrid } from '@/features/platform-metrics/get-platform-metrics/metrics-grid';
import { Breadcrumbs } from '@/components/breadcrumbs';

export default function MetricsPage() {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      <div>
        <h2 className="text-2xl font-semibold">Platform Metrics</h2>
        <p className="text-sm text-muted-foreground">
          Cross-tenant snapshot of organizations, users, bookings, and revenue.
        </p>
      </div>
      <MetricsGrid />
    </div>
  );
}
