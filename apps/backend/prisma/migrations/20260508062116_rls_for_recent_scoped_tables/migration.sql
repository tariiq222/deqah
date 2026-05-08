-- P2 fix (2026-05-08): thirteen tables that are in SCOPED_MODELS but have never
-- had ROW LEVEL SECURITY enabled.  Without RLS, any code path that bypasses the
-- Prisma tenant-scoping extension (raw $queryRaw, direct connection, dump-and-load)
-- returns cross-tenant rows.
--
-- Tables covered:
--   * EmployeeBreak             — per-tenant employee break windows
--   * OrganizationEmailConfig   — per-tenant SMTP credentials (singleton per org)
--   * NotificationDeliveryLog   — per-tenant notification audit data
--   * BillingCredit             — per-tenant billing credits / adjustments
--   * Invitation                — per-tenant user invitations
--   * UsageCounter              — materialized quota counters (tenant-scoped)
--   * OrganizationInvoiceCounter — per-tenant invoice sequence counters
--   * RefundUsageRevertLog      — refund→usage decrement idempotency log
--   * ZohoContactLink           — Zoho integration link table (tenant-scoped)
--   * ZohoInvoiceLink           — Zoho invoice mirror (tenant-scoped)
--   * ZohoCreditNoteLink        — Zoho credit note mirror (tenant-scoped)
--   * ZohoWebhookEvent          — Zoho webhook deliveries (tenant-scoped)
--   * IntegrationAuditLog       — per-tenant integration audit events
--
-- Pattern matches `20260428110000_rls_for_remaining_scoped_tables`:
--   ENABLE + FORCE ROW LEVEL SECURITY, DROP POLICY IF EXISTS, CREATE POLICY
--   with USING + WITH CHECK and the super-admin bypass
--   (OR app_current_org_id() IS NULL).
--
-- All thirteen tables have organizationId NOT NULL, so we use the strict
-- NOT-NULL pattern (no IS NULL arm on the column side).

-- ── EmployeeBreak (organizationId NOT NULL) ─────────────────────────────
ALTER TABLE "EmployeeBreak" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeBreak" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_employee_break ON "EmployeeBreak";
CREATE POLICY tenant_isolation_employee_break ON "EmployeeBreak"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── OrganizationEmailConfig (organizationId NOT NULL, singleton per org) ─
ALTER TABLE "OrganizationEmailConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationEmailConfig" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_organization_email_config ON "OrganizationEmailConfig";
CREATE POLICY tenant_isolation_organization_email_config ON "OrganizationEmailConfig"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── NotificationDeliveryLog (organizationId NOT NULL) ───────────────────
ALTER TABLE "NotificationDeliveryLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDeliveryLog" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_notification_delivery_log ON "NotificationDeliveryLog";
CREATE POLICY tenant_isolation_notification_delivery_log ON "NotificationDeliveryLog"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── BillingCredit (organizationId NOT NULL) ─────────────────────────────
ALTER TABLE "BillingCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingCredit" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_billing_credit ON "BillingCredit";
CREATE POLICY tenant_isolation_billing_credit ON "BillingCredit"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── Invitation (organizationId NOT NULL) ────────────────────────────────
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_invitation ON "Invitation";
CREATE POLICY tenant_isolation_invitation ON "Invitation"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── UsageCounter (organizationId NOT NULL) ──────────────────────────────
ALTER TABLE "UsageCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageCounter" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_usage_counter ON "UsageCounter";
CREATE POLICY tenant_isolation_usage_counter ON "UsageCounter"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── OrganizationInvoiceCounter (organizationId NOT NULL) ────────────────
ALTER TABLE "OrganizationInvoiceCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationInvoiceCounter" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_organization_invoice_counter ON "OrganizationInvoiceCounter";
CREATE POLICY tenant_isolation_organization_invoice_counter ON "OrganizationInvoiceCounter"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── RefundUsageRevertLog (organizationId NOT NULL) ──────────────────────
ALTER TABLE "RefundUsageRevertLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundUsageRevertLog" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_refund_usage_revert_log ON "RefundUsageRevertLog";
CREATE POLICY tenant_isolation_refund_usage_revert_log ON "RefundUsageRevertLog"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── ZohoContactLink (organizationId NOT NULL) ───────────────────────────
ALTER TABLE "ZohoContactLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ZohoContactLink" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_zoho_contact_link ON "ZohoContactLink";
CREATE POLICY tenant_isolation_zoho_contact_link ON "ZohoContactLink"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── ZohoInvoiceLink (organizationId NOT NULL) ───────────────────────────
ALTER TABLE "ZohoInvoiceLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ZohoInvoiceLink" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_zoho_invoice_link ON "ZohoInvoiceLink";
CREATE POLICY tenant_isolation_zoho_invoice_link ON "ZohoInvoiceLink"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── ZohoCreditNoteLink (organizationId NOT NULL) ────────────────────────
ALTER TABLE "ZohoCreditNoteLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ZohoCreditNoteLink" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_zoho_credit_note_link ON "ZohoCreditNoteLink";
CREATE POLICY tenant_isolation_zoho_credit_note_link ON "ZohoCreditNoteLink"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── ZohoWebhookEvent (organizationId NOT NULL) ──────────────────────────
ALTER TABLE "ZohoWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ZohoWebhookEvent" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_zoho_webhook_event ON "ZohoWebhookEvent";
CREATE POLICY tenant_isolation_zoho_webhook_event ON "ZohoWebhookEvent"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);

-- ── IntegrationAuditLog (organizationId NOT NULL) ───────────────────────
ALTER TABLE "IntegrationAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationAuditLog" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_integration_audit_log ON "IntegrationAuditLog";
CREATE POLICY tenant_isolation_integration_audit_log ON "IntegrationAuditLog"
  USING      ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL)
  WITH CHECK ("organizationId"::uuid = app_current_org_id() OR app_current_org_id() IS NULL);
