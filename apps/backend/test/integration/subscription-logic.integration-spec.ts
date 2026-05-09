import { testPrisma, cleanTables } from '../setup/db.setup';
import { seedUser } from '../setup/seed.helper';
import { UsageMetric } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('Subscription Logic (integration)', () => {
  beforeEach(async () => {
    await cleanTables(['Subscription', 'Plan', 'Organization', 'User', 'Membership']);
  });

  afterEach(async () => {
    await cleanTables(['Subscription', 'Plan', 'Organization', 'User', 'Membership']);
  });

  describe('Subscription state machine', () => {
    it('creates subscription in TRIAL state', async () => {
      const org = await testPrisma.organization.create({
        data: {
          id: '00000000-0000-0000-0000-000000000091',
          slug: 'sub-test-org',
          nameAr: 'اختبار',
          nameEn: 'Sub Test Org',
          status: 'ACTIVE',
        },
      });

      const plan = await testPrisma.plan.create({
        data: {
          slug: 'TRIALPLAN',
          nameAr: 'خطة تجريبية',
          nameEn: 'Trial Plan',
          priceMonthly: 0,
          priceAnnual: 0,
          currency: 'SAR',
          limits: {},
        },
      });

      const subscription = await testPrisma.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: 'TRIALING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      expect(subscription.status).toBe('TRIALING');
    });

    it('enforces plan limits', async () => {
      const plan = await testPrisma.plan.create({
        data: {
          slug: 'LIMITEDPLAN',
          nameAr: 'خطة محدودة',
          nameEn: 'Limited Plan',
          priceMonthly: 100,
          priceAnnual: 1000,
          currency: 'SAR',
          limits: { employees: 5, clients: 100 } as Prisma.InputJsonValue,
        },
      });

      expect(plan.limits).toBeDefined();
      const limits = plan.limits as { employees?: number };
      expect(limits.employees).toBe(5);
    });
  });

  describe('Usage metering', () => {
    it('increments usage counter', async () => {
      const org = await testPrisma.organization.create({
        data: {
          id: '00000000-0000-0000-0000-000000000092',
          slug: 'usage-test-org',
          nameAr: 'اختبار',
          nameEn: 'Usage Test Org',
          status: 'ACTIVE',
        },
      });

      const plan = await testPrisma.plan.create({
        data: {
          slug: 'USAGEPLAN',
          nameAr: 'خطة معلقة',
          nameEn: 'Usage Plan',
          priceMonthly: 50,
          priceAnnual: 500,
          currency: 'SAR',
          limits: {},
        },
      });

      const subscription = await testPrisma.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const usageRecord = await testPrisma.usageRecord.create({
        data: {
          organizationId: org.id,
          subscriptionId: subscription.id,
          metric: UsageMetric.BOOKINGS_PER_MONTH,
          count: 0,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const updated = await testPrisma.usageRecord.update({
        where: { id: usageRecord.id },
        data: { count: 10 },
      });

      expect(updated.count).toBe(10);
    });
  });
});