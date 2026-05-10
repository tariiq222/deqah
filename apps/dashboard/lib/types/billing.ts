/**
 * Billing Types — Deqah Dashboard
 * SaaS Plan 04 — billing skeleton
 */

// Slug is any admin-configured identifier — format enforced on the backend.
export type PlanSlug = string
export type BillingCycle = 'MONTHLY' | 'ANNUAL'
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED'
export type InvoiceStatus = 'DRAFT' | 'DUE' | 'PAID' | 'FAILED' | 'VOID'

export interface Plan {
  id: string
  slug: PlanSlug
  nameAr: string
  nameEn: string
  priceMonthly: string
  priceAnnual: string
  currency: string
  limits: Record<string, number | boolean>
  sortOrder: number
}

export interface Subscription {
  id: string
  organizationId: string
  status: SubscriptionStatus
  billingCycle: BillingCycle
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt?: string | null
  canceledAt?: string | null
  cancelAtPeriodEnd?: boolean
  scheduledCancellationDate?: string | null
  scheduledPlanId?: string | null
  scheduledBillingCycle?: BillingCycle | null
  scheduledPlanChangeAt?: string | null
  pastDueSince?: string | null
  dunningRetryCount?: number
  nextRetryAt?: string | null
  plan: Plan
  invoices?: SubscriptionInvoice[]
  usage?: Partial<Record<string, number>>
}

export interface ChangePlanInput {
  planId: string
  billingCycle: BillingCycle
}

export interface ProrationPreview {
  action: 'UPGRADE_NOW' | 'SCHEDULE_DOWNGRADE'
  targetPlanId: string
  billingCycle: BillingCycle
  amountSar: string
  amountHalalas: number
  remainingRatio: number
  periodStart: string
  periodEnd: string
  effectiveAt: string
  isUpgrade: boolean
  clearsScheduledCancellation?: boolean
  trialChange?: boolean
}

export interface SavedCard {
  id: string
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
  holderName?: string | null
  isDefault: boolean
  createdAt: string
}

export interface AddSavedCardInput {
  moyasarTokenId: string
  makeDefault?: boolean
  idempotencyKey?: string
}

export interface RetryPaymentResponse {
  ok: boolean
  status: 'PAID' | 'FAILED' | 'DUPLICATE_ATTEMPT'
  attemptNumber?: number
}

export interface SubscriptionInvoice {
  id: string
  amount: string
  flatAmount: string
  overageAmount: string
  lineItems: Array<{
    kind: 'FLAT_FEE' | 'OVERAGE' | 'PRORATION'
    metric?: string
    description?: string
    amount: number | string
    amountHalalas?: number
  }>
  currency: string
  status: InvoiceStatus
  billingCycle: BillingCycle
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt?: string | null
  receiptUrl?: string | null
}

// Phase 7 — tenant invoice list and detail (Zoho is the single invoicing system).
export interface Invoice {
  id: string
  invoiceNumber: string | null
  status: InvoiceStatus
  amount: string
  currency: string
  periodStart: string
  periodEnd: string
  issuedAt: string | null
  paidAt: string | null
  /** Zoho invoice portal URL — null when mirror not yet ready. */
  zohoInvoiceUrl: string | null
  /** Zoho-hosted PDF download URL — null when mirror not yet ready. */
  zohoPdfUrl: string | null
}

export interface InvoiceListResponse {
  items: Invoice[]
  nextCursor: string | null
}

export interface InvoiceListFilters {
  status?: InvoiceStatus
  cursor?: string
  limit?: number
}

// Phase 5 — usage counters
export interface UsageRow {
  featureKey: string
  current: number
  limit: number
  percentage: number
  periodEnd: string | null
}

// Phase 4 — Downgrade violation discriminated union

export type QuantitativeViolation = {
  kind: 'QUANTITATIVE';
  featureKey: 'branches' | 'employees' | 'monthly_bookings';
  current: number;
  targetMax: number;
};

export type BooleanViolation = {
  kind: 'BOOLEAN';
  featureKey: string;
  blockingResources: {
    count: number;
    sampleIds: string[];
    deepLink: string;
  };
};

export type DowngradeViolation = QuantitativeViolation | BooleanViolation;

export type DowngradeBlockedBody = {
  code: 'DOWNGRADE_VIOLATES_NEW_LIMITS';
  message: string;
  messageAr: string;
  violations: DowngradeViolation[];
};

export class DowngradeBlockedError extends Error {
  constructor(public readonly body: DowngradeBlockedBody) {
    super(body.message);
    this.name = 'DowngradeBlockedError';
  }
}

export const isQuantitativeViolation = (v: DowngradeViolation): v is QuantitativeViolation =>
  v.kind === 'QUANTITATIVE';
export const isBooleanViolation = (v: DowngradeViolation): v is BooleanViolation =>
  v.kind === 'BOOLEAN';
