import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OwnerOnlyGuard } from './owner-only.guard';

describe('OwnerOnlyGuard', () => {
  let guard: OwnerOnlyGuard;
  let prisma: { user: { findUnique: jest.Mock } };

  const ctxFor = (user: { sub?: string; id?: string }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    guard = new OwnerOnlyGuard(prisma as never);
    process.env.OWNER_EMAILS = 'tariq@deqah.net, owner2@deqah.net';
  });

  afterEach(() => {
    delete process.env.OWNER_EMAILS;
  });

  it('allows when user email is in OWNER_EMAILS (case-insensitive)', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'TARIQ@deqah.net' });
    await expect(guard.canActivate(ctxFor({ sub: 'u_1' }))).resolves.toBe(true);
  });

  it('throws ForbiddenException when user email is NOT in OWNER_EMAILS', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'someone-else@deqah.net' });
    await expect(guard.canActivate(ctxFor({ sub: 'u_1' }))).rejects.toThrow(ForbiddenException);
  });

  it('throws when OWNER_EMAILS is empty/missing', async () => {
    delete process.env.OWNER_EMAILS;
    prisma.user.findUnique.mockResolvedValue({ email: 'tariq@deqah.net' });
    await expect(guard.canActivate(ctxFor({ sub: 'u_1' }))).rejects.toThrow('owner_emails_not_configured');
  });

  it('throws when user.id is missing', async () => {
    await expect(guard.canActivate(ctxFor({}))).rejects.toThrow('owner_only');
  });

  it('throws when DB has no user row for the JWT sub', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(ctxFor({ sub: 'u_missing' }))).rejects.toThrow('owner_only');
  });

  it('trims whitespace and ignores empty entries in OWNER_EMAILS', async () => {
    process.env.OWNER_EMAILS = '  tariq@deqah.net  , , ';
    prisma.user.findUnique.mockResolvedValue({ email: 'tariq@deqah.net' });
    await expect(guard.canActivate(ctxFor({ sub: 'u_1' }))).resolves.toBe(true);
  });

  it('reads userId from req.user.id when sub is missing', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'tariq@deqah.net' });
    await expect(guard.canActivate(ctxFor({ id: 'u_2' }))).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u_2' },
      select: { email: true },
    });
  });
});
