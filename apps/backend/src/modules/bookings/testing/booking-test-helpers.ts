import { BookingStatus } from '@prisma/client';

const future = new Date(Date.now() + 86400_000);

export const mockBooking = {
  id: 'book-1', branchId: 'branch-1',
  clientId: 'client-1', employeeId: 'emp-1', serviceId: 'svc-1',
  scheduledAt: future, endsAt: new Date(future.getTime() + 3600_000),
  durationMins: 60, price: 200, currency: 'SAR',
  status: BookingStatus.PENDING, bookingType: 'INDIVIDUAL',
  bookingNumber: 1,
  createdAt: new Date(), updatedAt: new Date(),
};

const buildPrismaRaw = () => ({
  booking: {
    findUnique: jest.fn().mockResolvedValue(mockBooking),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(mockBooking),
    update: jest.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.CONFIRMED }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(1),
  },
  bookingStatusLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    count: jest.fn().mockResolvedValue(0),
  },
  waitlistEntry: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'wl-1', status: 'WAITING' }),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  businessHour: {
    findUnique: jest.fn().mockResolvedValue({
      branchId: 'branch-1', dayOfWeek: future.getDay(),
      startTime: '09:00', endTime: '17:00', isOpen: true,
    }),
  },
  holiday: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  employeeAvailability: {
    findMany: jest.fn().mockResolvedValue([
      { employeeId: 'emp-1', dayOfWeek: future.getDay(), startTime: '09:00', endTime: '17:00', isActive: true },
    ]),
  },
  employeeAvailabilityException: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  service: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'svc-1', durationMins: 60, price: 200, currency: 'SAR',
    }),
    findFirst: jest.fn().mockResolvedValue({
      id: 'svc-1', durationMins: 60, price: 200, currency: 'SAR',
      minParticipants: 1, maxParticipants: 1, reserveWithoutPayment: false,
    }),
    findMany: jest.fn().mockResolvedValue([{ id: 'svc-1', durationMins: 60, price: 200, currency: 'SAR' }]),
  },
  employee: {
    findUnique: jest.fn().mockResolvedValue({ id: 'emp-1' }),
    findFirst: jest.fn().mockResolvedValue({ id: 'emp-1' }),
    findMany: jest.fn().mockResolvedValue([{ id: 'emp-1' }]),
  },
  employeeService: {
    findUnique: jest.fn().mockResolvedValue({ id: 'es-1', employeeId: 'emp-1', serviceId: 'svc-1' }),
  },
  branch: {
    findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
  },
  client: {
    findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }),
    findMany: jest.fn().mockResolvedValue([{ id: 'client-1', source: 'ONLINE' }]),
  },
});

// $transaction supports two shapes:
//   prisma.$transaction([promise1, promise2])   -> array form
//   prisma.$transaction(async (tx) => { ... })  -> interactive form
export const buildPrisma = () => {
  const p = buildPrismaRaw() as ReturnType<typeof buildPrismaRaw> & { $transaction: jest.Mock };
  p.$transaction = jest.fn(
    (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
      if (typeof arg === 'function') return arg(p);
      return Promise.all(arg);
    },
  );
  // Route pure id-lookup findFirst calls (no status/employee filter) to findUnique.
  const conflictFindFirst = p.booking.findFirst;
  p.booking.findFirst = jest.fn((args: { where?: Record<string, unknown> } = {}) => {
    const where = args.where ?? {};
    if ('id' in where && !('status' in where) && !('employeeId' in where)) {
      return p.booking.findUnique({ where: { id: where.id as string } });
    }
    return conflictFindFirst(args);
  });
  return p;
};

export const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });

export const buildZoomHandler = () => ({
  execute: jest.fn().mockResolvedValue({ joinUrl: 'https://zoom.example/join' }),
});

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/** Minimal TenantContextService mock — always returns the default org id. */
export const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue(DEFAULT_ORG_ID),
});
