import { BookingAutocompleteCron } from './booking-autocomplete.cron';
import { BookingExpiryCron } from './booking-expiry.cron';
import { BookingNoShowCron } from './booking-noshow.cron';
import { RefreshTokenCleanupCron } from './refresh-token-cleanup.cron';
import { AppointmentRemindersCron } from './appointment-reminders.cron';
import { BookingStatus } from '@prisma/client';

const buildCls = () => ({
  run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  set: jest.fn(),
});

const buildPrisma = () => ({
  $allTenants: {
    organization: {
      findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue([{}]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    bookingSettings: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    refreshToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    waitlistEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    groupSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
  passwordResetToken: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

describe('BookingAutocompleteCron', () => {
  it('executes without throwing', async () => {
    const prisma = buildPrisma();
    const cron = new BookingAutocompleteCron(prisma as never, buildCls() as never);
    await expect(cron.execute()).resolves.not.toThrow();
  });

  it('calls updateMany with CONFIRMED status and cutoff, scoped per tenant', async () => {
    const prisma = buildPrisma();
    const cron = new BookingAutocompleteCron(prisma as never, buildCls() as never);
    await cron.execute();
    expect(prisma.$allTenants.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: expect.any(String),
          status: BookingStatus.CONFIRMED,
        }),
        data: expect.objectContaining({ status: BookingStatus.COMPLETED }),
      }),
    );
  });

  it('iterates each active tenant and reads its own bookingSettings', async () => {
    const prisma = buildPrisma();
    const cron = new BookingAutocompleteCron(prisma as never, buildCls() as never);
    await cron.execute();

    // Two active orgs in the mock → two updateMany calls, each scoped to its org
    expect(prisma.$allTenants.organization.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$allTenants.bookingSettings.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.$allTenants.bookingSettings.findFirst).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', branchId: null }) }),
    );
    expect(prisma.$allTenants.bookingSettings.findFirst).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-2', branchId: null }) }),
    );
    expect(prisma.$allTenants.booking.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('BookingExpiryCron', () => {
  // Legacy path (flag off) preserves the pre-launch-readiness behavior.
  // Enhanced-path coverage lives in booking-expiry.cron.spec.ts.
  const buildFlags = () => ({ bookingExpiryEnabled: false });

  it('executes without throwing', async () => {
    const prisma = buildPrisma();
    const cron = new BookingExpiryCron(
      prisma as never,
      buildFlags() as never,
      buildCls() as never,
    );
    await expect(cron.execute()).resolves.not.toThrow();
  });

  it('updates pending bookings that have expired', async () => {
    const prisma = buildPrisma();
    prisma.$allTenants.booking.updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const cron = new BookingExpiryCron(
      prisma as never,
      buildFlags() as never,
      buildCls() as never,
    );
    await cron.execute();
    expect(prisma.$allTenants.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: BookingStatus.PENDING,
          expiresAt: expect.anything(),
        }),
      }),
    );
  });
});

describe('BookingNoShowCron', () => {
  it('executes without throwing', async () => {
    const prisma = buildPrisma();
    const cron = new BookingNoShowCron(prisma as never, buildCls() as never);
    await expect(cron.execute()).resolves.not.toThrow();
  });

  it('marks confirmed bookings past cutoff as NO_SHOW, scoped per tenant', async () => {
    const prisma = buildPrisma();
    prisma.$allTenants.booking.updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const cron = new BookingNoShowCron(prisma as never, buildCls() as never);
    await cron.execute();
    expect(prisma.$allTenants.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: expect.any(String),
          status: BookingStatus.CONFIRMED,
        }),
        data: expect.objectContaining({
          status: BookingStatus.NO_SHOW,
        }),
      }),
    );
  });

  it('iterates each active tenant and reads its own bookingSettings', async () => {
    const prisma = buildPrisma();
    const cron = new BookingNoShowCron(prisma as never, buildCls() as never);
    await cron.execute();

    expect(prisma.$allTenants.organization.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$allTenants.bookingSettings.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.$allTenants.bookingSettings.findFirst).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', branchId: null }) }),
    );
    expect(prisma.$allTenants.booking.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('RefreshTokenCleanupCron', () => {
  it('deletes expired tokens', async () => {
    const prisma = buildPrisma();
    const cron = new RefreshTokenCleanupCron(prisma as never, buildCls() as never);
    await cron.execute();
    expect(prisma.$allTenants.refreshToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ expiresAt: expect.anything() }),
          ]),
        }),
      }),
    );
  });

  it('executes without throwing when no tokens to delete', async () => {
    const prisma = buildPrisma();
    prisma.$allTenants.refreshToken.deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const cron = new RefreshTokenCleanupCron(prisma as never, buildCls() as never);
    await expect(cron.execute()).resolves.not.toThrow();
  });
});

describe('AppointmentRemindersCron', () => {
  it('executes without throwing', async () => {
    const prisma = buildPrisma();
    const cron = new AppointmentRemindersCron(prisma as never, buildCls() as never);
    await expect(cron.execute()).resolves.not.toThrow();
  });

  it('checks waitlist entries', async () => {
    const prisma = buildPrisma();
    prisma.$allTenants.waitlistEntry.findMany = jest.fn().mockResolvedValue([{ id: 'w-1' }, { id: 'w-2' }]);
    const cron = new AppointmentRemindersCron(prisma as never, buildCls() as never);
    await cron.execute();
    expect(prisma.$allTenants.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'WAITING' }),
        take: 50,
      }),
    );
  });
});
