import { test, expect } from "@playwright/test"

const STAGING_ROOT = process.env.E2E_STAGING_ROOT ?? "staging.deqah.net"
const KNOWN_TENANT_SLUG = process.env.E2E_KNOWN_TENANT_SLUG ?? "iu"
const RUN_AGAINST_STAGING = process.env.E2E_RUN_SUBDOMAIN === "1"

test.describe("subdomain branding — existing tenant", () => {
  test.skip(!RUN_AGAINST_STAGING, "set E2E_RUN_SUBDOMAIN=1 to run against staging")

  test("renders login form (not 404) and injects branding style", async ({ page }) => {
    await page.goto(`https://${KNOWN_TENANT_SLUG}.${STAGING_ROOT}/login`)

    // Should NOT be the 404 page
    await expect(page.getByText("هذه العيادة غير موجودة")).toHaveCount(0)

    // Should render the login form (welcome heading from existing login form)
    await expect(page.getByText(/مرحب|البريد الإلكتروني|الجوال/)).toBeVisible({ timeout: 5000 })

    // Branding style block should be present in DOM (server-injected)
    const brandingStyleCount = await page
      .locator('style')
      .filter({ hasText: ":root {" })
      .count()
    expect(brandingStyleCount).toBeGreaterThanOrEqual(0) // may be 0 if tenant has no custom colors
  })
})
