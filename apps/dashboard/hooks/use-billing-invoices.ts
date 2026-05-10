"use client"

/**
 * Phase 7 — Billing invoices listing hook for the tenant dashboard.
 * Distinct from `use-invoices` which serves booking invoices.
 *
 * Invoice PDFs are now hosted by Zoho (single invoicing system). Use the
 * `zohoPdfUrl` field on each Invoice item to link directly to the
 * Zoho-hosted PDF. There is no local download endpoint.
 */

import { useQuery } from "@tanstack/react-query"
import { billingApi } from "@/lib/api/billing"
import type {
  InvoiceListFilters,
  InvoiceListResponse,
} from "@/lib/types/billing"

export function useBillingInvoices(filters: InvoiceListFilters) {
  return useQuery<InvoiceListResponse>({
    queryKey: ["billing", "invoices", filters],
    queryFn: () => billingApi.listInvoices(filters),
  })
}
