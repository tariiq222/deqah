export const enZoho: Record<string, string> = {
  "zoho.menuLabel": "Zoho Invoice",
  "zoho.title": "Zoho Invoice Integration",
  "zoho.description":
    "After every successful payment we issue an invoice in your Zoho Invoice organization and send the client a link. Subscriptions stay in Deqah — Zoho only issues the invoice.",

  "zoho.notConnected.title": "Not connected",
  "zoho.notConnected.body":
    "Connect your Zoho Invoice account to issue an invoice for every captured payment and email the link to the client.",
  "zoho.notConnected.dcLabel": "Zoho data center",
  "zoho.notConnected.dcHint":
    "Saudi Arabia tenants must use 'sa'. Your Zoho organization currency must be SAR.",
  "zoho.notConnected.connect": "Connect Zoho",
  "zoho.notConnected.connecting": "Preparing…",

  "zoho.status.connected": "Connected",
  "zoho.status.inactive": "Inactive — reconnect required",
  "zoho.status.pendingOrgSelect": "Select a Zoho organization",
  "zoho.status.org": "Zoho organization",
  "zoho.status.dc": "Data center",
  "zoho.status.webhookUrl": "Webhook URL (paste in Zoho settings)",
  "zoho.status.webhookHint":
    "In Zoho: Settings → Automation → Webhooks → New. Use the URL above and the secret we generated. Unsigned deliveries are rejected.",

  "zoho.actions.test": "Test connection",
  "zoho.actions.testing": "Testing…",
  "zoho.actions.testOk": "✓ Connection healthy",
  "zoho.actions.testFail": "Test failed: {error}",
  "zoho.actions.disconnect": "Disconnect",
  "zoho.actions.disconnecting": "Disconnecting…",
  "zoho.actions.disconnectConfirm":
    "Disconnect Zoho? Existing invoices stay; no new ones will be issued.",

  "zoho.config.title": "Invoice defaults",
  "zoho.config.sendOnCreate": "Auto-email new invoices to the client",
  "zoho.config.itemId": "Default Zoho item id (optional)",
  "zoho.config.itemIdHint":
    "Leave blank to use ad-hoc line items per booking.",
  "zoho.config.branchId": "Zoho branch id (multi-branch orgs only)",
  "zoho.config.paymentTerms": "Payment terms text",
  "zoho.config.save": "Save",
  "zoho.config.saving": "Saving…",
  "zoho.config.saved": "Saved",

  "zoho.payments.title": "Zoho invoices per client payment",
  "zoho.payments.description":
    "Every captured payment is mirrored as a Zoho invoice. Open the link to view what the client received or resend the email.",
  "zoho.payments.colDate": "Date",
  "zoho.payments.colAmount": "Amount",
  "zoho.payments.colMethod": "Method",
  "zoho.payments.colInvoice": "Deqah invoice",
  "zoho.payments.colZoho": "Zoho status",
  "zoho.payments.colActions": "Actions",
  "zoho.payments.zohoNotMirrored": "Not mirrored",
  "zoho.payments.openInvoice": "Open invoice",
  "zoho.payments.openPdf": "PDF",
  "zoho.payments.resend": "Resend",
  "zoho.payments.resending": "Sending…",
  "zoho.payments.resent": "Sent",
  "zoho.payments.empty": "No payments yet.",
  "zoho.payments.filterClient": "Client:",
  "zoho.payments.filterClear": "Clear filter",
  "zoho.payments.filterPlaceholder": "Search by client name or phone…",
  "zoho.payments.filterSearching": "Searching…",
  "zoho.payments.filterNoResults": "No matching clients",

  "zoho.selectOrg.title": "Select Zoho organization",
  "zoho.selectOrg.description":
    "Your Zoho account has multiple organizations. Pick the one to issue invoices from.",
  "zoho.selectOrg.confirm": "Confirm",
  "zoho.selectOrg.placeholder": "Enter Zoho organization_id",

  "zoho.banner.reconnect": "Zoho Invoice connection is down — new invoices will not be issued until you reconnect.",
  "zoho.banner.reconnectLink": "Reconnect in settings",
}
