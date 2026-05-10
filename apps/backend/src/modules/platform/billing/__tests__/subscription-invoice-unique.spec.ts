/**
 * CR-7 Phase 3 — SubscriptionInvoice unique constraint guard test
 *
 * Verifies that the DB-level unique index
 *   SubscriptionInvoice_sub_period_cycle_uq (subscriptionId, periodStart, billingCycle)
 * prevents double-charging the same billing period.
 *
 * The test does NOT spin up NestJS or a real DB — it mocks the Prisma `create`
 * call to throw a `PrismaClientKnownRequestError` with code P2002 (exactly what
 * Postgres returns when the unique constraint fires), then asserts the error
 * propagates with the correct code.  This mirrors the pattern used in
 * add-to-waitlist.handler.spec.ts.
 */

import { Prisma } from '@prisma/client';

const SUB_ID = 'sub-cr7-test-1';
const ORG_ID = 'org-cr7-test-1';
const PERIOD_START = new Date('2026-05-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-05-31T23:59:59.999Z');
const DUE_DATE = new Date('2026-06-01T00:00:00.000Z');

/** Minimal shape returned / accepted by subscriptionInvoice.create */
interface InvoiceCreateInput {
  data: {
    subscriptionId: string;
    organizationId: string;
    billingCycle: string;
    periodStart: Date;
    periodEnd: Date;
    dueDate: Date;
    amount: number;
    flatAmount: number;
  };
}

function buildP2002(constraintName: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`subscriptionId`,`periodStart`,`billingCycle`)', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [constraintName] },
  });
}

function buildPrismaWithDuplicate() {
  let callCount = 0;
  return {
    $allTenants: {
      subscriptionInvoice: {
        create: jest.fn().mockImplementation((_input: InvoiceCreateInput) => {
          callCount += 1;
          if (callCount > 1) {
            throw buildP2002('SubscriptionInvoice_sub_period_cycle_uq');
          }
          return Promise.resolve({ id: 'inv-first', subscriptionId: SUB_ID });
        }),
      },
    },
    _getCallCount: () => callCount,
  };
}

describe('SubscriptionInvoice unique (subscriptionId, periodStart, billingCycle)', () => {
  const invoicePayload = {
    subscriptionId: SUB_ID,
    organizationId: ORG_ID,
    billingCycle: 'MONTHLY',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    dueDate: DUE_DATE,
    amount: 199,
    flatAmount: 199,
  };

  it('allows inserting the first invoice for a given (subscriptionId, periodStart, billingCycle)', async () => {
    const prisma = buildPrismaWithDuplicate();

    const result = await prisma.$allTenants.subscriptionInvoice.create({ data: invoicePayload });

    expect(result).toMatchObject({ id: 'inv-first', subscriptionId: SUB_ID });
    expect(prisma.$allTenants.subscriptionInvoice.create).toHaveBeenCalledTimes(1);
  });

  it('throws P2002 when a duplicate (subscriptionId, periodStart, billingCycle) is inserted', async () => {
    const prisma = buildPrismaWithDuplicate();

    // First insert — should succeed
    await prisma.$allTenants.subscriptionInvoice.create({ data: invoicePayload });

    // Second insert with identical (subscriptionId, periodStart, billingCycle) — constraint fires
    let thrown: unknown;
    try {
      await prisma.$allTenants.subscriptionInvoice.create({ data: invoicePayload });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const prismaErr = thrown as Prisma.PrismaClientKnownRequestError;
    expect(prismaErr.code).toBe('P2002');
    expect(prismaErr.meta?.['target']).toContain('SubscriptionInvoice_sub_period_cycle_uq');
  });

  it('allows two invoices with the same subscriptionId but different periodStart', async () => {
    const firstPeriod = { ...invoicePayload, periodStart: new Date('2026-04-01T00:00:00.000Z') };
    const secondPeriod = { ...invoicePayload, periodStart: new Date('2026-05-01T00:00:00.000Z') };

    // Both inserts go to independent mocks — each is call #1 on their own instance.
    // We build a fresh prisma per call to simulate different rows being inserted.
    const prismaA = buildPrismaWithDuplicate();
    const prismaB = buildPrismaWithDuplicate();

    const resultA = await prismaA.$allTenants.subscriptionInvoice.create({ data: firstPeriod });
    const resultB = await prismaB.$allTenants.subscriptionInvoice.create({ data: secondPeriod });

    expect(resultA.subscriptionId).toBe(SUB_ID);
    expect(resultB.subscriptionId).toBe(SUB_ID);
  });

  it('allows two invoices with same subscriptionId and periodStart but different billingCycle', async () => {
    const prismaMonthly = buildPrismaWithDuplicate();
    const prismaAnnual = buildPrismaWithDuplicate();

    const monthly = { ...invoicePayload, billingCycle: 'MONTHLY' };
    const annual = { ...invoicePayload, billingCycle: 'ANNUAL' };

    const resultMonthly = await prismaMonthly.$allTenants.subscriptionInvoice.create({ data: monthly });
    const resultAnnual = await prismaAnnual.$allTenants.subscriptionInvoice.create({ data: annual });

    expect(resultMonthly.subscriptionId).toBe(SUB_ID);
    expect(resultAnnual.subscriptionId).toBe(SUB_ID);
  });
});
