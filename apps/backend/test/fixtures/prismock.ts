import { PrismockClient, createPrismock } from 'prismock';
import type { PrismaService } from '../../src/infrastructure/database';

let prismockInstance: ReturnType<typeof PrismockClient> | null = null;

export function getPrismock(): ReturnType<typeof PrismockClient> {
  if (!prismockInstance) {
    prismockInstance = new PrismockClient() as ReturnType<typeof PrismockClient>;
  }
  return prismockInstance;
}

export function resetPrismock(): void {
  prismockInstance = null;
}

export function createPrismockService(): PrismaService {
  return getPrismock() as unknown as PrismaService;
}

export function buildPrismaOverride(overrides: Partial<ReturnType<typeof PrismockClient>>) {
  const base = getPrismock();
  return { ...base, ...overrides } as unknown as PrismaService;
}
