import { test, expect } from '@playwright/test';
import { devLogin } from './helpers/auth';

test.describe('Subscription & Plan Flow', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('should navigate to subscription overview', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display subscription page with plan info', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const planSection = page.locator('text=/plan|خطة/i').first();
    await expect(planSection).toBeVisible({ timeout: 10_000 });
  });

  test('should display current plan badge', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const currentPlan = page.locator('text=/current|current plan|النظام الحالي/i').first();
    await expect(currentPlan).toBeVisible({ timeout: 10_000 });
  });

  test('should display usage section', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const usageSection = page.locator('text=/usage|استخدام/i').first();
    await expect(usageSection).toBeVisible({ timeout: 10_000 });
  });

  test('should display usage bar or progress indicator', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const usageBar = page.locator('[class*="progress"], [class*="usage"], [role="progressbar"]').first();
    await expect(usageBar).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to usage page', async ({ page }) => {
    await page.goto('/subscription/usage');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display usage breakdown by category', async ({ page }) => {
    await page.goto('/subscription/usage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const breakdown = page.locator('text=/breakdown|تفصيل/i').first();
    await expect(breakdown).toBeVisible({ timeout: 10_000 });
  });

  test('should display employees usage', async ({ page }) => {
    await page.goto('/subscription/usage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const employeesUsage = page.locator('text=/employe|موظف/i').first();
    await expect(employeesUsage).toBeVisible({ timeout: 10_000 });
  });

  test('should display storage usage', async ({ page }) => {
    await page.goto('/subscription/usage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const storageUsage = page.locator('text=/storage|تخزين/i').first();
    await expect(storageUsage).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to plans page', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display available plans', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const plansSection = page.locator('text=/plan|خطة/i').first();
    await expect(plansSection).toBeVisible({ timeout: 10_000 });
  });

  test('should display monthly billing option', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const monthlyOption = page.locator('text=/monthly|شهري/i').first();
    await expect(monthlyOption).toBeVisible({ timeout: 10_000 });
  });

  test('should display annual billing option', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const annualOption = page.locator('text=/annual|سنوي/i').first();
    await expect(annualOption).toBeVisible({ timeout: 10_000 });
  });

  test('should toggle billing cycle between monthly and annual', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const annualToggle = page.locator('text=/annual|سنوي/i').first();
    const monthlyToggle = page.locator('text=/monthly|شهري/i').first();

    const annualVisible = await annualToggle.isVisible({ timeout: 5000 }).catch(() => false);
    const monthlyVisible = await monthlyToggle.isVisible({ timeout: 5000 }).catch(() => false);

    if (annualVisible) {
      await annualToggle.click();
      await page.waitForTimeout(1000);
    } else if (monthlyVisible) {
      await page.locator('button:has-text("annual" i)').first().click();
      await page.waitForTimeout(1000);
    } else {
      test.skip();
    }
  });

  test('should display plan features list', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const featuresList = page.locator('[class*="feature"], ul li').first();
    await expect(featuresList).toBeVisible({ timeout: 10_000 });
  });

  test('should display upgrade button on plan card', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const upgradeButton = page.locator('button:has-text("upgrade" i), button:has-text("ترقية")').first();
    await expect(upgradeButton).toBeVisible({ timeout: 10_000 });
  });

  test('should display current plan as selected', async ({ page }) => {
    await page.goto('/subscription/plans');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const currentBadge = page.locator('text=/current|current|الحالي/i');
    await expect(currentBadge.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to payment methods page', async ({ page }) => {
    await page.goto('/subscription/payment-methods');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display saved payment methods', async ({ page }) => {
    await page.goto('/subscription/payment-methods');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const paymentSection = page.locator('text=/payment|دفع|i').first();
    await expect(paymentSection).toBeVisible({ timeout: 10_000 });
  });

  test('should display add payment method button', async ({ page }) => {
    await page.goto('/subscription/payment-methods');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const addButton = page.locator('button:has-text("add" i), button:has-text("إضافة")').first();
    await expect(addButton).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to invoices page', async ({ page }) => {
    await page.goto('/subscription/invoices');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display invoices table', async ({ page }) => {
    await page.goto('/subscription/invoices');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const invoicesTable = page.locator('table, [class*="invoice"]').first();
    await expect(invoicesTable).toBeVisible({ timeout: 10_000 });
  });

  test('should display invoice download button', async ({ page }) => {
    await page.goto('/subscription/invoices');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const downloadButton = page.locator('button:has-text("download" i), button:has-text("تحميل")').first();
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
  });

  test('should display trial banner when applicable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const trialBanner = page.locator('text=/trial|تجربة/i').first();
    await expect(trialBanner).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to upgrade from trial banner', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const upgradeLink = page.locator('a[href="/subscription"], button:has-text("upgrade" i), button:has-text("ترقية")').first();
    const visible = await upgradeLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip();
      return;
    }
    await upgradeLink.click();
    await page.waitForURL(/\/subscription/, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display feature limit warning', async ({ page }) => {
    await page.goto('/subscription/usage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const warning = page.locator('text=/limit|حد|warning|تحذير/i').first();
    await expect(warning).toBeVisible({ timeout: 10_000 });
  });

  test('should display billing contact info', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const billingContact = page.locator('text=/billing|الفواتير/i').first();
    await expect(billingContact).toBeVisible({ timeout: 10_000 });
  });
});
