/**
 * Billing API — Deqah Dashboard
 * SaaS Plan 04 — billing skeleton
 */

import { api, ApiError } from "@/lib/api"
import type {
  AddSavedCardInput,
  ChangePlanInput,
  DowngradeBlockedBody,
  Invoice,
  InvoiceListFilters,
  InvoiceListResponse,
  Plan,
  ProrationPreview,
  RetryPaymentResponse,
  SavedCard,
  Subscription,
  UsageRow,
} from "@/lib/types/billing"
import { DowngradeBlockedError } from "@/lib/types/billing"

function rethrowIfDowngradeBlocked(err: unknown): never {
  if (
    err instanceof ApiError &&
    err.status === 422
  ) {
    const body = err.body as DowngradeBlockedBody
    if (body?.code === 'DOWNGRADE_VIOLATES_NEW_LIMITS') {
      throw new DowngradeBlockedError(body)
    }
  }
  throw err
}

export const billingApi = {
  listPlans: () =>
    api.get<Plan[]>('/dashboard/billing/plans'),

  currentSubscription: () =>
    api.get<Subscription | null>('/dashboard/billing/subscription'),

  startSubscription: (dto: ChangePlanInput) =>
    api.post<Subscription>('/dashboard/billing/subscription/start', dto),

  changePlan: (dto: ChangePlanInput) =>
    api.post<Subscription>('/dashboard/billing/subscription/change-plan', dto).catch(rethrowIfDowngradeBlocked),

  prorationPreview: (dto: ChangePlanInput) =>
    api.get<ProrationPreview>('/dashboard/billing/subscription/proration-preview', {
      planId: dto.planId,
      billingCycle: dto.billingCycle,
    }),

  upgrade: (dto: ChangePlanInput) =>
    api.post<Subscription>('/dashboard/billing/subscription/upgrade', dto),

  downgrade: (dto: ChangePlanInput) =>
    api.post<Subscription>('/dashboard/billing/subscription/downgrade', dto).catch(rethrowIfDowngradeBlocked),

  scheduleDowngrade: (dto: ChangePlanInput) =>
    api.post<Subscription>('/dashboard/billing/subscription/schedule-downgrade', dto).catch(rethrowIfDowngradeBlocked),

  cancelScheduledDowngrade: () =>
    api.post<Subscription>('/dashboard/billing/subscription/cancel-scheduled-downgrade', {}),

  scheduleCancel: (reason?: string) =>
    api.post<Subscription>('/dashboard/billing/subscription/schedule-cancel', { reason }),

  cancel: (reason?: string) =>
    api.post<Subscription>('/dashboard/billing/subscription/cancel', { reason }),

  resume: () =>
    api.post<Subscription>('/dashboard/billing/subscription/resume', {}),

  reactivate: () =>
    api.post<Subscription>('/dashboard/billing/subscription/reactivate', {}),

  retryPayment: () =>
    api.post<RetryPaymentResponse>('/dashboard/billing/subscription/retry-payment', {}),

  listSavedCards: () =>
    api.get<SavedCard[]>('/dashboard/billing/saved-cards'),

  addSavedCard: (dto: AddSavedCardInput) =>
    api.post<SavedCard>('/dashboard/billing/saved-cards', dto),

  setDefaultSavedCard: (id: string) =>
    api.patch<SavedCard>(`/dashboard/billing/saved-cards/${id}/set-default`, {}),

  removeSavedCard: (id: string) =>
    api.delete<{ ok: true }>(`/dashboard/billing/saved-cards/${id}`),

  // Phase 7 — invoices (Zoho is the single invoicing system; use zohoInvoiceUrl / zohoPdfUrl from items)
  listInvoices: (filters: InvoiceListFilters = {}) =>
    api.get<InvoiceListResponse>('/dashboard/billing/invoices', {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
      ...(filters.limit ? { limit: filters.limit } : {}),
    }),

  getInvoice: (id: string) =>
    api.get<Invoice>(`/dashboard/billing/invoices/${id}`),

  // Phase 5 — usage counters
  getUsage: () =>
    api.get<UsageRow[]>('/dashboard/billing/usage'),
}
