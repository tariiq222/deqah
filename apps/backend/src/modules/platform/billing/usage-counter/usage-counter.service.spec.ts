import { UsageCounterService } from './usage-counter.service';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { EPOCH } from './period.util';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ORG_ID = 'org-test-123';

/**
 * In-memory simulator for the atomic INSERT … ON CONFLICT DO UPDATE used
 * by `increment()`. Matches production semantics (GREATEST(0, value + by)
 * on conflict, GREATEST(0, by) on insert) without hitting Postgres.
 */
function makePrisma() {
  const store = new Map<string, number>();

  const key = (orgId: string, fk: string, ps: Date) =>
    `${orgId}::${fk}::${ps.toISOString()}`;

  const mockCounter = {
    upsert: jest.fn(async ({ where, update, create }: {
      where: { organizationId_featureKey_periodStart: { organizationId: string; featureKey: string; periodStart: Date } };
      update: { value: number };
      create: { organizationId: string; featureKey: string; periodStart: Date; value: number };
    }) => {
      const k = key(
        where.organizationId_featureKey_periodStart.organizationId,
        where.organizationId_featureKey_periodStart.featureKey,
        where.organizationId_featureKey_periodStart.periodStart,
      );
      const existing = store.get(k);
      if (existing !== undefined) {
        store.set(k, update.value);
      } else {
        store.set(k, create.value);
      }
    }),
    findUnique: jest.fn(async ({ where }: {
      where: { organizationId_featureKey_periodStart: { organizationId: string; featureKey: string; periodStart: Date } };
    }) => {
      const k = key(
        where.organizationId_featureKey_periodStart.organizationId,
        where.organizationId_featureKey_periodStart.featureKey,
        where.organizationId_featureKey_periodStart.periodStart,
      );
      const v = store.get(k);
      return v !== undefined ? { value: v } : null;
    }),
  };

  // Simulates INSERT … ON CONFLICT DO UPDATE SET value = GREATEST(0, value + by).
  // Prisma.sql tags the statement with `values` (positional bindings); we
  // extract orgId, featureKey, periodStart, by from there in the order they
  // appear in usage-counter.service.ts.
  const mockExecuteRaw = jest.fn(async (template: { strings?: readonly string[]; values?: unknown[] }) => {
    const values = (template?.values ?? []) as unknown[];
    // Order from the template: [orgId, featureKey, periodStart, by, by]
    // (the `by` placeholder appears twice — once in VALUES, once in DO UPDATE).
    const [orgId, fk, ps, byInsert] = values;
    const k = key(orgId as string, fk as string, ps as Date);
    const existing = store.get(k);
    if (existing !== undefined) {
      store.set(k, Math.max(0, existing + (byInsert as number)));
    } else {
      store.set(k, Math.max(0, byInsert as number));
    }
    return 1;
  });

  return {
    usageCounter: mockCounter,
    $executeRaw: mockExecuteRaw,
    _store: store,
    _key: key,
  } as unknown as PrismaService & { _store: Map<string, number>; _key: typeof key };
}

describe('UsageCounterService', () => {
  it('increments from 0 → 1, then 1 → 3 (by 2)', async () => {
    const prisma = makePrisma();
    const svc = new UsageCounterService(prisma);

    await svc.increment(ORG_ID, FeatureKey.EMPLOYEES, EPOCH, 1);
    expect(await svc.read(ORG_ID, FeatureKey.EMPLOYEES, EPOCH)).toBe(1);

    await svc.increment(ORG_ID, FeatureKey.EMPLOYEES, EPOCH, 2);
    expect(await svc.read(ORG_ID, FeatureKey.EMPLOYEES, EPOCH)).toBe(3);
  });

  it('returns null for a non-existent counter', async () => {
    const prisma = makePrisma();
    const svc = new UsageCounterService(prisma);

    const result = await svc.read(ORG_ID, FeatureKey.BRANCHES, EPOCH);
    expect(result).toBeNull();
  });

  it('upsertExact overwrites the current value', async () => {
    const prisma = makePrisma();
    const svc = new UsageCounterService(prisma);

    await svc.increment(ORG_ID, FeatureKey.SERVICES, EPOCH, 5);
    await svc.upsertExact(ORG_ID, FeatureKey.SERVICES, EPOCH, 10);
    expect(await svc.read(ORG_ID, FeatureKey.SERVICES, EPOCH)).toBe(10);
  });

  it('clamps decrement at 0 — counter never goes negative', async () => {
    const prisma = makePrisma();
    const svc = new UsageCounterService(prisma);

    await svc.increment(ORG_ID, FeatureKey.BRANCHES, EPOCH, 2);
    await svc.increment(ORG_ID, FeatureKey.BRANCHES, EPOCH, -5); // would be -3 without clamp
    expect(await svc.read(ORG_ID, FeatureKey.BRANCHES, EPOCH)).toBe(0);
  });
});
