import { adminRequest } from '@/lib/api-client';

export interface OrgBillingSubscription {
  id: string;
  status: string;
  billingCycle: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  planId: string;
  plan: {
    slug: string;
    nameEn: string;
    priceMonthly: string | number;
  };
}

export interface OrgBillingInvoice {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

export interface OrgBillingCredit {
  id: string;
  amount: number;
  consumedAt: string | null;
}

export interface OrgBillingDunningLog {
  id: string;
  status: string;
}

export interface OrgBillingResponse {
  org: {
    id: string;
    slug: string;
    nameAr: string;
    nameEn: string | null;
    status: string;
  };
  subscription: OrgBillingSubscription | null;
  invoices?: OrgBillingInvoice[];
  credits?: OrgBillingCredit[];
  dunningLogs?: OrgBillingDunningLog[];
}

export function getOrgBilling(orgId: string): Promise<OrgBillingResponse> {
  return adminRequest<OrgBillingResponse>(`/billing/subscriptions/${orgId}`);
}
