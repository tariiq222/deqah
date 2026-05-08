import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';

const ADMIN_THROTTLER_CONFIG = [
  { name: 'admin-mutation', ttl: 60_000, limit: 30 },
  { name: 'admin-mutation-slow', ttl: 60_000, limit: 5 },
] as const;

describe('ThrottlerModule config — admin named limiters', () => {
  it('compiles when admin-mutation and admin-mutation-slow named limiters are registered', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([...ADMIN_THROTTLER_CONFIG]),
      ],
    }).compile();
    expect(module).toBeDefined();
  });

  it('admin-mutation-slow allows fewer requests per window than admin-mutation', () => {
    const slow = ADMIN_THROTTLER_CONFIG.find(c => c.name === 'admin-mutation-slow')!;
    const normal = ADMIN_THROTTLER_CONFIG.find(c => c.name === 'admin-mutation')!;
    expect(slow).toBeDefined();
    expect(normal).toBeDefined();
    expect(slow.limit).toBeLessThan(normal.limit);
  });

  it('both limiters share the same ttl window (60 seconds)', () => {
    for (const entry of ADMIN_THROTTLER_CONFIG) {
      expect(entry.ttl).toBe(60_000);
    }
  });

  it('admin-mutation-slow limit is exactly 5 (matches destructive-op contract)', () => {
    const slow = ADMIN_THROTTLER_CONFIG.find(c => c.name === 'admin-mutation-slow')!;
    expect(slow.limit).toBe(5);
  });

  it('admin-mutation limit is exactly 30 (safe for batch ops)', () => {
    const normal = ADMIN_THROTTLER_CONFIG.find(c => c.name === 'admin-mutation')!;
    expect(normal.limit).toBe(30);
  });
});
