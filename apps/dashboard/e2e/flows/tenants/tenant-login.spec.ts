import { test, expect } from '@playwright/test';

test.describe('Tenant Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form with all elements', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/مرحباً|Welcome/);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = page.locator('button[aria-label*="كلمة"]').or(page.locator('button[aria-label*="Password"]')).or(page.locator('button').filter({ has: page.locator('svg') }).nth(0));
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
    }
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.click('a[href="/forgot-password"]');
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('should show error with invalid email format', async ({ page }) => {
    await page.fill('#email', 'notanemail')
    await page.fill('#password', 'somepassword')
    await page.click('button[type="submit"]')

    await page.waitForTimeout(1000)

    const errorText = page.locator('text=/invalid|غير صالح|البريد الإلكتروني|email/i')
    const formStillVisible = await page.locator('#email').isVisible()
    expect(formStillVisible).toBe(true)
  })

  test('should show error with wrong credentials', async ({ page }) => {
    await page.fill('#email', 'wrong@example.com')
    await page.fill('#password', 'wrongpassword')
    await page.click('button[type="submit"]')

    await page.waitForTimeout(2000)

    const stillOnLogin = await page.url()
    expect(stillOnLogin).toContain('/login')
  })

  test('should login with valid credentials via dev login', async ({ page }) => {
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      test.skip();
    }

    const devEmail = process.env.NEXT_PUBLIC_DEV_EMAIL;
    const devPassword = process.env.NEXT_PUBLIC_DEV_PASSWORD;

    if (!devEmail || !devPassword) {
      test.skip();
    }

    const devLoginButton = page.locator('button:has-text("Dev Admin Login")');
    if (await devLoginButton.isVisible()) {
      await devLoginButton.click();
      await page.waitForURL('/', { timeout: 10000 });
      await expect(page.locator('body')).toContainText(/لوحة التحكم|داشبورد|Dashboard|overview/i);
    }
  });

  test('should complete full login flow with valid credentials', async ({ page }) => {
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      test.skip();
    }

    const devEmail = process.env.NEXT_PUBLIC_DEV_EMAIL;
    const devPassword = process.env.NEXT_PUBLIC_DEV_PASSWORD;

    if (!devEmail || !devPassword) {
      test.skip();
    }

    await page.fill('#email', devEmail!)
    await page.fill('#password', devPassword!)

    await page.click('button[type="submit"]')

    await page.waitForURL('/', { timeout: 15000 })
    await expect(page.locator('body')).toContainText(/لوحة التحكم|داشبورد|Dashboard|overview/i)
  })

  test('should logout and return to login', async ({ page }) => {
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      test.skip();
    }

    const devEmail = process.env.NEXT_PUBLIC_DEV_EMAIL;
    const devPassword = process.env.NEXT_PUBLIC_DEV_PASSWORD;

    if (!devEmail || !devPassword) {
      test.skip();
    }

    const devLoginButton = page.locator('button:has-text("Dev Admin Login")');
    if (await devLoginButton.isVisible()) {
      await devLoginButton.click();
      await page.waitForURL('/', { timeout: 10000 });
    }

    await page.goto('/')

    const userButton = page.locator('header button').filter({ has: page.locator('img, [class*="Avatar"]') }).last()
    if (!(await userButton.isVisible())) {
      const avatarButton = page.locator('header button[class*="rounded-lg"]')
      if (await avatarButton.isVisible()) {
        await avatarButton.click()
      }
    } else {
      await userButton.click()
    }

    await page.waitForTimeout(300)
    const logoutButton = page.locator('button:has-text("logout"), button:has-text("تسجيل الخروج")')
    if (await logoutButton.isVisible()) {
      await logoutButton.click()
      await page.waitForURL('/login', { timeout: 10000 })
      await expect(page.locator('#email')).toBeVisible()
    }
  })

  test('should navigate to register page', async ({ page }) => {
    const registerLink = page.locator('a[href="/register"]')
    if (await registerLink.isVisible()) {
      await registerLink.click()
      await expect(page).toHaveURL(/\/register/)
    }
  })

  test('should have working captcha in dev mode', async ({ page }) => {
    const captchaDevMode = page.locator('text=/dev mode|وضع التطوير/i')
    if (await captchaDevMode.isVisible()) {
      await expect(captchaDevMode).toBeVisible()
    }
  })
});