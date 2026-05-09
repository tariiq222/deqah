import { Test, TestingModule } from '@nestjs/testing';
import { ListClientBookingsHandler } from './list-client-bookings.handler';
import { PrismaService } from '../../../infrastructure/database';

describe('ListClientBookingsHandler', () => {
  let handler: ListClientBookingsHandler;

  const baseBooking = {
    id: 'bk-1',
    clientId: 'cl-1',
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    branchId: 'br-1',
    status: 'CONFIRMED',
    scheduledAt: new Date('2026-01-01T10:00:00Z'),
    endsAt: new Date('2026-01-01T11:00:00Z'),
    durationMins: 60,
    price: 150,
    currency: 'SAR',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const mockPrisma = {
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    employee: { findMany: jest.fn() },
    service: { findMany: jest.fn() },
    branch: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    payment: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListClientBookingsHandler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get<ListClientBookingsHandler>(ListClientBookingsHandler);
  });

  it('returns empty list when no bookings', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);
    mockPrisma.booking.count.mockResolvedValue(0);

    const result = await handler.execute('cl-1');

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('maps serviceName to EN and serviceNameAr to AR', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([baseBooking]);
    mockPrisma.booking.count.mockResolvedValue(1);
    mockPrisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', name: 'John', nameAr: 'جون' },
    ]);
    mockPrisma.service.findMany.mockResolvedValue([
      { id: 'svc-1', nameEn: 'Haircut', nameAr: 'قص شعر' },
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([
      { id: 'br-1', nameEn: 'Main Branch', nameAr: 'الفرع الرئيسي' },
    ]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await handler.execute('cl-1');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];

    // EN field must hold English name
    expect(item.serviceName).toBe('Haircut');
    // AR field must hold Arabic name
    expect(item.serviceNameAr).toBe('قص شعر');

    expect(item.branchName).toBe('Main Branch');
    expect(item.branchNameAr).toBe('الفرع الرئيسي');

    expect(item.employeeName).toBe('John');
    expect(item.employeeNameAr).toBe('جون');
  });

  it('falls back to empty string for missing EN service name', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([baseBooking]);
    mockPrisma.booking.count.mockResolvedValue(1);
    mockPrisma.employee.findMany.mockResolvedValue([]);
    mockPrisma.service.findMany.mockResolvedValue([]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await handler.execute('cl-1');
    const item = result.items[0];

    expect(item.serviceName).toBe('');
    expect(item.serviceNameAr).toBeNull();
    expect(item.branchName).toBe('');
    expect(item.branchNameAr).toBeNull();
  });

  it('respects pagination parameters', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);
    mockPrisma.booking.count.mockResolvedValue(25);

    const result = await handler.execute('cl-1', 3, 5);

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(25);
    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });
});
