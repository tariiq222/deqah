import { BadRequestException, ConflictException } from '@nestjs/common';
import { RecurringFrequency } from '@prisma/client';
import { CreateRecurringBookingHandler } from './create-recurring-booking.handler';

const mockTenant = { requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001') };
const buildFeatureCheck = (enabled = true) => ({ isEnabled: jest.fn().mockResolvedValue(enabled) });

const future = new Date(Date.now() + 86400_000); // tomorrow
const mockBooking = (scheduledAt: Date, id = 'book-1') => ({
  id,
  branchId: 'branch-1',
  clientId: 'client-1',
  employeeId: 'emp-1',
  serviceId: 'svc-1',
  scheduledAt,
  endsAt: new Date(scheduledAt.getTime() + 3600_000),
  durationMins: 60,
  price: 200,
  currency: 'SAR',
  status: 'PENDING',
  bookingType: 'INDIVIDUAL',
  recurringGroupId: 'rg-1',
  recurringPattern: RecurringFrequency.WEEKLY,
});

const buildPrisma = (overrides?: Partial<{ findFirst: jest.Mock; create: jest.Mock }>) => {
  const prisma = {
    booking: {
      findFirst: overrides?.findFirst ?? jest.fn().mockResolvedValue(null),
      create: overrides?.create ?? jest.fn().mockImplementation(({ data }) =>
        Promise.resolve(mockBooking(data.scheduledAt, `book-${Math.random()}`)),
      ),
    },
    // Simulate $transaction by calling the callback with the prisma itself (unit test context)
    $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  };
  return prisma;
};

const baseDto = {
  branchId: 'branch-1',
  clientId: 'client-1',
  employeeId: 'emp-1',
  serviceId: 'svc-1',
  scheduledAt: future,
  durationMins: 60,
  price: 200,
};

describe('CreateRecurringBookingHandler', () => {
  describe('input validation', () => {
    it('throws BadRequestException when neither occurrences nor until is provided', async () => {
      const handler = new CreateRecurringBookingHandler(buildPrisma() as never, mockTenant as never, buildFeatureCheck() as never);
      await expect(
        handler.execute({ ...baseDto, frequency: RecurringFrequency.WEEKLY }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when both occurrences and until are provided', async () => {
      const handler = new CreateRecurringBookingHandler(buildPrisma() as never, mockTenant as never, buildFeatureCheck() as never);
      await expect(
        handler.execute({
          ...baseDto,
          frequency: RecurringFrequency.WEEKLY,
          occurrences: 3,
          until: new Date(Date.now() + 30 * 86400_000),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CUSTOM frequency without customDates', async () => {
      const handler = new CreateRecurringBookingHandler(buildPrisma() as never, mockTenant as never, buildFeatureCheck() as never);
      await expect(
        handler.execute({ ...baseDto, frequency: RecurringFrequency.CUSTOM, occurrences: 3 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when occurrences < 1', async () => {
      const handler = new CreateRecurringBookingHandler(buildPrisma() as never, mockTenant as never, buildFeatureCheck() as never);
      await expect(
        handler.execute({ ...baseDto, frequency: RecurringFrequency.WEEKLY, occurrences: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when intervalDays is 0', async () => {
      const handler = new CreateRecurringBookingHandler(buildPrisma() as never, mockTenant as never, buildFeatureCheck() as never);
      await expect(
        handler.execute({
          ...baseDto,
          frequency: RecurringFrequency.DAILY,
          intervalDays: 0,
          until: new Date(Date.now() + 7 * 86400_000),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('WEEKLY recurrence', () => {
    it('creates N bookings sharing the same recurringGroupId', async () => {
      const prisma = buildPrisma();
      const handler = new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never);
      const result = await handler.execute({
        ...baseDto,
        frequency: RecurringFrequency.WEEKLY,
        occurrences: 3,
      });
      expect(prisma.booking.create).toHaveBeenCalledTimes(3);
      const groupIds = result.map((b) => b.recurringGroupId);
      expect(new Set(groupIds).size).toBe(1); // all share same group
    });

    it('schedules each booking 7 days apart', async () => {
      const prisma = buildPrisma();
      const handler = new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never);
      const calls: Date[] = [];
      prisma.booking.create = jest.fn().mockImplementation(({ data }) => {
        calls.push(data.scheduledAt);
        return Promise.resolve(mockBooking(data.scheduledAt));
      });
      await handler.execute({
        ...baseDto,
        frequency: RecurringFrequency.WEEKLY,
        occurrences: 3,
      });
      expect(calls[1].getTime() - calls[0].getTime()).toBe(7 * 86400_000);
      expect(calls[2].getTime() - calls[1].getTime()).toBe(7 * 86400_000);
    });
  });

  describe('DAILY recurrence', () => {
    it('creates bookings every day by default', async () => {
      const prisma = buildPrisma();
      const calls: Date[] = [];
      prisma.booking.create = jest.fn().mockImplementation(({ data }) => {
        calls.push(data.scheduledAt);
        return Promise.resolve(mockBooking(data.scheduledAt));
      });
      await new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never).execute({
        ...baseDto,
        frequency: RecurringFrequency.DAILY,
        occurrences: 3,
      });
      expect(calls[1].getTime() - calls[0].getTime()).toBe(86400_000);
    });

    it('respects custom intervalDays', async () => {
      const prisma = buildPrisma();
      const calls: Date[] = [];
      prisma.booking.create = jest.fn().mockImplementation(({ data }) => {
        calls.push(data.scheduledAt);
        return Promise.resolve(mockBooking(data.scheduledAt));
      });
      await new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never).execute({
        ...baseDto,
        frequency: RecurringFrequency.DAILY,
        intervalDays: 2,
        occurrences: 3,
      });
      expect(calls[1].getTime() - calls[0].getTime()).toBe(2 * 86400_000);
    });
  });

  describe('CUSTOM recurrence', () => {
    it('creates bookings on exactly the provided dates', async () => {
      const d1 = new Date(future);
      const d2 = new Date(future.getTime() + 5 * 86400_000);
      const d3 = new Date(future.getTime() + 9 * 86400_000);
      const prisma = buildPrisma();
      const calls: Date[] = [];
      prisma.booking.create = jest.fn().mockImplementation(({ data }) => {
        calls.push(data.scheduledAt);
        return Promise.resolve(mockBooking(data.scheduledAt));
      });
      await new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never).execute({
        ...baseDto,
        frequency: RecurringFrequency.CUSTOM,
        customDates: [d1, d2, d3],
      });
      expect(calls).toHaveLength(3);
      expect(calls[0].getTime()).toBe(d1.getTime());
      expect(calls[1].getTime()).toBe(d2.getTime());
      expect(calls[2].getTime()).toBe(d3.getTime());
    });
  });

  describe('until-based termination', () => {
    it('creates bookings up to and including the until date', async () => {
      const until = new Date(future.getTime() + 14 * 86400_000); // 2 weeks out
      const prisma = buildPrisma();
      const calls: Date[] = [];
      prisma.booking.create = jest.fn().mockImplementation(({ data }) => {
        calls.push(data.scheduledAt);
        return Promise.resolve(mockBooking(data.scheduledAt));
      });
      await new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never).execute({
        ...baseDto,
        frequency: RecurringFrequency.WEEKLY,
        until,
      });
      // future, future+7d, future+14d = 3 occurrences
      expect(calls).toHaveLength(3);
      expect(calls[calls.length - 1].getTime()).toBeLessThanOrEqual(until.getTime());
    });
  });

  describe('conflict handling', () => {
    it('throws ConflictException on first conflict when skipConflicts is false (default)', async () => {
      const prisma = buildPrisma({
        findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
      });
      const handler = new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never);
      await expect(
        handler.execute({ ...baseDto, frequency: RecurringFrequency.WEEKLY, occurrences: 3 }),
      ).rejects.toThrow(ConflictException);
      // No bookings created when first slot conflicts
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException on mid-series conflict (skipConflicts false) — no prior bookings persisted', async () => {
      let callCount = 0;
      const prisma = buildPrisma({
        findFirst: jest.fn().mockImplementation(() => {
          callCount++;
          // Call 1: lastBooking number lookup (no conflict). Call 2: occurrence 1 conflict check (no conflict). Call 3: occurrence 2 conflict check (conflict).
          return callCount === 3 ? Promise.resolve({ id: 'existing' }) : Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(mockBooking(data.scheduledAt)),
        ),
      });
      await expect(
        new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never).execute({
          ...baseDto,
          frequency: RecurringFrequency.WEEKLY,
          occurrences: 3,
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.booking.create).toHaveBeenCalledTimes(1);
    });

    it('skips conflicting slots when skipConflicts is true', async () => {
      let callCount = 0;
      const prisma = buildPrisma({
        findFirst: jest.fn().mockImplementation(() => {
          callCount++;
          // Conflict on 2nd occurrence only
          return callCount === 2 ? Promise.resolve({ id: 'existing' }) : Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(mockBooking(data.scheduledAt)),
        ),
      });
      const result = await new CreateRecurringBookingHandler(prisma as never, mockTenant as never, buildFeatureCheck() as never).execute({
        ...baseDto,
        frequency: RecurringFrequency.WEEKLY,
        occurrences: 3,
        skipConflicts: true,
      });
      // Only 2 of 3 created (2nd skipped)
      expect(result).toHaveLength(2);
      expect(prisma.booking.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('feature gate', () => {
    it('throws BadRequestException when RECURRING_BOOKINGS feature is disabled', async () => {
      const prisma = buildPrisma();
      const handler = new CreateRecurringBookingHandler(
        prisma as never,
        mockTenant as never,
        buildFeatureCheck(false) as never,
      );
      await expect(
        handler.execute({ ...baseDto, frequency: RecurringFrequency.WEEKLY, occurrences: 3 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });
  });
});
