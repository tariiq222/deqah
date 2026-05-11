import { test, expect } from "@playwright/test"

const STAGING_ROOT = process.env.E2E_STAGING_ROOT ?? "staging.deqah.net"
const RUN_AGAINST_STAGING = process.env.E2E_RUN_SUBDOMAIN === "1"

test.describe("subdomain 404 — non-existent tenant", () => {
  test.skip(!RUN_AGAINST_STAGING, "set E2E_RUN_SUBDOMAIN=1 to run against staging")

  test("shows TenantNotFound page for unknown subdomain", async ({ page }) => {
    const slug = `nonexistent-${Date.now()}`
    await page.goto(`https://${slug}.${STAGING_ROOT}/login`)
    await expect(page.getByText("هذه العيادة غير موجودة")).toBeVisible()
    await expect(page.getByRole("link", { name: /منصة دقة/ })).toBeVisible()
  })
})
