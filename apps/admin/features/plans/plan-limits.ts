export interface PlanLimits {
  maxBranches: number;
  maxEmployees: number;
  maxServices: number;
  maxBookingsPerMonth: number;
  maxClients: number;
  overageRateBookings: number;
  overageRateClients: number;
  recurring_bookings: boolean;
  waitlist: boolean;
  group_sessions: boolean;
  ai_chatbot: boolean;
  email_templates: boolean;
  coupons: boolean;
  advanced_reports: boolean;
  intake_forms: boolean;
  custom_roles: boolean;
  activity_log: boolean;
  // Phase 3: 15 new boolean keys
  zoom_integration: boolean;
  zoho_invoice_integration: boolean;
  walk_in_bookings: boolean;
  bank_transfer_payments: boolean;
  multi_branch: boolean;
  departments: boolean;
  client_ratings: boolean;
  data_export: boolean;
  sms_provider_per_tenant: boolean;
  white_label_mobile: boolean;
  custom_domain: boolean;
  api_access: boolean;
  webhooks: boolean;
  priority_support: boolean;
  audit_export: boolean;
  multi_currency: boolean;
  email_fallback_monthly: number;
  sms_fallback_monthly: number;
}

export const QUOTA_FIELDS = [
  { key: 'maxBranches', label: 'Max branches', hint: '-1 = unlimited' },
  { key: 'maxEmployees', label: 'Max employees', hint: '-1 = unlimited' },
  { key: 'maxServices', label: 'Max services', hint: '-1 = unlimited' },
  { key: 'maxBookingsPerMonth', label: 'Bookings / month', hint: '-1 = unlimited' },
  { key: 'maxClients', label: 'Max clients', hint: '-1 = unlimited' },
] as const satisfies ReadonlyArray<{ key: keyof PlanLimits; label: string; hint: string }>;

export const OVERAGE_FIELDS = [
  { key: 'overageRateBookings', label: 'Overage — per booking (⃁)' },
  { key: 'overageRateClients', label: 'Overage — per client (⃁)' },
] as const satisfies ReadonlyArray<{ key: keyof PlanLimits; label: string }>;

/**
 * Maps catalog quantitative FeatureKey values to their corresponding flat
 * PlanLimits numeric field. Used by FeatureRow and FeatureGroupSection to
 * render inline quota inputs for quantitative catalog entries.
 */
export const QUANT_FIELD_MAP = {
  branches: 'maxBranches',
  employees: 'maxEmployees',
  services: 'maxServices',
  monthly_bookings: 'maxBookingsPerMonth',
} as const satisfies Partial<Record<string, keyof PlanLimits>>;

export const FEATURE_FIELDS = [
  { key: 'recurring_bookings', label: 'Recurring bookings' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'group_sessions', label: 'Group sessions' },
  { key: 'ai_chatbot', label: 'AI chatbot' },
  { key: 'email_templates', label: 'Email templates' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'advanced_reports', label: 'Advanced reports' },
  { key: 'intake_forms', label: 'Intake forms' },
  { key: 'custom_roles', label: 'Custom roles' },
  { key: 'activity_log', label: 'Activity log' },
  // Phase 3: 15 new keys — Phase 4 will replace this array with FEATURE_CATALOG iteration
  { key: 'zoom_integration', label: 'Zoom Integration' },
  { key: 'zoho_invoice_integration', label: 'Zoho Invoice Integration' },
  { key: 'walk_in_bookings', label: 'Walk-in Bookings' },
  { key: 'bank_transfer_payments', label: 'Bank Transfer Payments' },
  { key: 'multi_branch', label: 'Multi-Branch' },
  { key: 'departments', label: 'Departments' },
  { key: 'client_ratings', label: 'Client Ratings' },
  { key: 'data_export', label: 'Data Export' },
  { key: 'sms_provider_per_tenant', label: 'Dedicated SMS Provider' },
  { key: 'white_label_mobile', label: 'White-label Mobile App' },
  { key: 'custom_domain', label: 'Custom Domain' },
  { key: 'api_access', label: 'API Access' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'priority_support', label: 'Priority Support' },
  { key: 'audit_export', label: 'Audit Log Export' },
  { key: 'multi_currency', label: 'Multi-Currency' },
] as const satisfies ReadonlyArray<{ key: keyof PlanLimits; label: string }>;

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  maxBranches: 1,
  maxEmployees: 5,
  maxServices: -1,
  maxBookingsPerMonth: -1,
  maxClients: -1,
  overageRateBookings: 0,
  overageRateClients: 0,
  recurring_bookings: false,
  waitlist: false,
  group_sessions: false,
  ai_chatbot: false,
  email_templates: false,
  coupons: false,
  advanced_reports: false,
  intake_forms: false,
  custom_roles: false,
  activity_log: false,
  // Phase 3: 15 new boolean keys
  zoom_integration: false,
  zoho_invoice_integration: false,
  walk_in_bookings: false,
  bank_transfer_payments: false,
  multi_branch: false,
  departments: false,
  client_ratings: false,
  data_export: false,
  sms_provider_per_tenant: false,
  white_label_mobile: false,
  custom_domain: false,
  api_access: false,
  webhooks: false,
  priority_support: false,
  audit_export: false,
  multi_currency: false,
  email_fallback_monthly: 500,
  sms_fallback_monthly: 100,
};

/**
 * Hydrates a raw Plan.limits JSON blob into a typed PlanLimits, filling
 * missing keys from DEFAULT_PLAN_LIMITS. Unknown keys are dropped — but
 * loudly: each unknown key emits a console.warn so plan-config drift is
 * visible in dev/CI logs.
 */
export function hydrateLimits(raw: Record<string, unknown> | undefined): PlanLimits {
  const out = { ...DEFAULT_PLAN_LIMITS };
  if (!raw) return out;
  const known = new Set(Object.keys(out));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      console.warn(
        `[plan-limits] hydrateLimits: dropping unknown key "${key}" — ` +
          "not present in PlanLimits. Add it to plan-limits.ts (and " +
          "plan-limits.zod.ts) or remove from Plan.limits JSON.",
      );
    }
  }
  for (const key of Object.keys(out) as Array<keyof PlanLimits>) {
    const v = raw[key];
    if (typeof out[key] === "boolean" && typeof v === "boolean") {
      (out[key] as boolean) = v;
    } else if (typeof out[key] === "number" && typeof v === "number") {
      (out[key] as number) = v;
    }
  }
  return out;
}

export function mergeLimits(
  raw: Record<string, unknown> | undefined,
  edited: PlanLimits,
): Record<string, unknown> {
  return { ...(raw ?? {}), ...edited };
}
