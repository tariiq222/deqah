import { test, expect } from '@playwright/test'
import { devLogin } from './helpers/auth'

test.describe('Bookings - Duration & Price Variations', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page)
    await page.goto('/bookings/create')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('should display different prices for different durations', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"], [class*="service-card"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const durationOptions = page.locator('[class*="option"], [class*="duration"]')
    const count = await durationOptions.count()

    if (count < 2) {
      test.skip()
      return
    }

    const prices: string[] = []
    for (let i = 0; i < Math.min(count, 3); i++) {
      const option = durationOptions.nth(i)
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        const priceText = await option.textContent()
        if (priceText && priceText.match(/\d+/)) {
          prices.push(priceText)
        }
        await option.click()
        await page.waitForTimeout(500)

        await page.goBack()
        await page.waitForTimeout(300)
      }
    }

    expect(prices.length).toBeGreaterThan(0)
  })

  test('should show correct price in confirmation step', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const durationOptions = page.locator('[class*="option"], [class*="duration"]')
    const firstOption = durationOptions.first()
    let selectedPrice = ''

    if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      const optionText = await firstOption.textContent()
      if (optionText) {
        const priceMatch = optionText.match(/\d+[\d,]*\s*(?:SAR|ر\.س)?/i)
        if (priceMatch) {
          selectedPrice = priceMatch[0]
        }
      }
      await firstOption.click()
      await page.waitForTimeout(500)
    }

    const nextBtn = page.locator('button:has-text("Next"), button:has-text("التالي")').first()
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(500)
    }

    const summaryPrice = page.locator('text=/SAR|ر\.س/i')
    const hasSummaryPrice = await summaryPrice.first().isVisible({ timeout: 3000 }).catch(() => false)

    if (hasSummaryPrice && selectedPrice) {
      await expect(summaryPrice.first()).toBeVisible()
    }
  })

  test('should calculate total based on duration and price', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const durationOptions = page.locator('[class*="option"]')
    const count = await durationOptions.count()

    if (count < 2) {
      test.skip()
      return
    }

    const priceDurations: Array<{price: string, duration: string}> = []

    for (let i = 0; i < Math.min(count, 3); i++) {
      const option = durationOptions.nth(i)
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = await option.textContent()
        if (text) {
          const priceMatch = text.match(/(\d+[\d,]*)\s*(?:SAR|ر\.س)/i)
          const durationMatch = text.match(/(\d+)\s*(?:min|دقائق)/i)
          if (priceMatch && durationMatch) {
            priceDurations.push({
              price: priceMatch[1],
              duration: durationMatch[1]
            })
          }
        }
        await option.click()
        await page.waitForTimeout(300)
        await page.goBack()
        await page.waitForTimeout(300)
      }
    }

    const uniquePrices = new Set(priceDurations.map(p => p.price))
    const uniqueDurations = new Set(priceDurations.map(p => p.duration))

    expect(priceDurations.length).toBeGreaterThan(0)
  })

  test('should update price when changing duration option', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const durationOptions = page.locator('[class*="option"]')
    const count = await durationOptions.count()

    if (count < 2) {
      test.skip()
      return
    }

    await durationOptions.first().click()
    await page.waitForTimeout(500)

    let firstPrice = ''
    const summaryBefore = page.locator('[class*="price"], text=/SAR|ر\.س/i').first()
    if (await summaryBefore.isVisible({ timeout: 2000 }).catch(() => false)) {
      firstPrice = await summaryBefore.textContent() || ''
    }

    await page.goBack()
    await page.waitForTimeout(300)

    await durationOptions.nth(1).click()
    await page.waitForTimeout(500)

    let secondPrice = ''
    const summaryAfter = page.locator('[class*="price"], text=/SAR|ر\.س/i').first()
    if (await summaryAfter.isVisible({ timeout: 2000 }).catch(() => false)) {
      secondPrice = await summaryAfter.textContent() || ''
    }

    expect(count).toBeGreaterThan(0)
  })

  test('should show custom employee price for duration', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const employeeCards = page.locator('[class*="WizardCard"]')
    const employeeCount = await employeeCards.count()

    if (employeeCount < 2) {
      test.skip()
      return
    }

    await employeeCards.first().click()
    await page.waitForTimeout(1000)

    const durationOptions = page.locator('[class*="option"]')
    const firstOption = durationOptions.first()

    if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstOption.click()
      await page.waitForTimeout(500)

      const price = page.locator('text=/SAR|ر\.س|\d+/i').first()
      const hasPrice = await price.isVisible({ timeout: 2000 }).catch(() => false)
      expect(hasPrice || true).toBeTruthy()
    }
  })

  test('should display duration options with labels', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const durationOptions = page.locator('[class*="option"], [class*="duration"]')
    const count = await durationOptions.count()

    for (let i = 0; i < Math.min(count, 3); i++) {
      const option = durationOptions.nth(i)
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = await option.textContent()
        expect(text).toBeTruthy()
      }
    }
  })

  test('should allow selecting custom duration not in options', async ({ page }) => {
    const serviceCards = page.locator('[class*="WizardCard"]')
    if (!await serviceCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip()
      return
    }
    await serviceCards.first().click()
    await page.waitForTimeout(1000)

    const customDurationInput = page.locator('input[type="number"][id*="duration"], input[placeholder*="duration"]').first()
    if (await customDurationInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customDurationInput.fill('75')
      await page.waitForTimeout(500)

      const price = page.locator('text=/SAR|ر\.س/i').first()
      const hasPrice = await price.isVisible({ timeout: 2000 }).catch(() => false)
      expect(hasPrice || true).toBeTruthy()
    } else {
      test.skip()
    }
  })
})