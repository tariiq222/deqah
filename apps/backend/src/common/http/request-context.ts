import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  organizationId?: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStorage = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  getOrThrow(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('RequestContext not initialized');
    return ctx;
  },
};
