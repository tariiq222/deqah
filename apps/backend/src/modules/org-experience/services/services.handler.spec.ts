import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceBookingMode } from '@prisma/client';
import { CreateServiceHandler } from './create-service.handler';

const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });
import { RecurringPatternDto } from './create-service.dto';
import { UpdateServiceHandler } from './update-service.handler';
import { ListServicesHandler } from './list-services.handler';
import { GetServiceHandler } from './get-service.handler';
import { ArchiveServiceHandler } from './archive-service.handler';
import { SetDurationOptionsHandler } from './set-duration-options.handler';
import { SetEmployeeServiceOptionsHandler } from './set-employee-service-options.handler';
import { SetServiceBookingConfigsHandler } from './set-service-booking-configs.handler';
import { GetServiceBookingConfigsHandler } from './get-service-booking-configs.handler';
import { TenantContextService } from '../../../common/tenant';
import { RlsTransactionService } from '../../../common/database/rls-transaction';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

const mockService = {
  id: 'svc-1',
  organizationId: DEFAULT_ORG,
  nameAr: 'قص الشعر',
  nameEn: 'Haircut',
  descriptionAr: null,
  descriptionEn: null,
  categoryId: null,
  durationMins: 30,
  price: '50.00',
  currency: 'SAR',
  imageUrl: null,
  isActive: true,
  isHidden: false,
  hidePriceOnBooking: false,
  hideDurationOnBooking: false,
  iconName: null,
  iconBgColor: null,
  bufferMinutes: 0,
  minLeadMinutes: null,
  maxAdvanceDays: null,
  depositEnabled: false,
  depositAmount: null,
  allowRecurring: false,
  allowedRecurringPatterns: [],
  maxRecurrences: null,
  minParticipants: 1,
  maxParticipants: 1,
  reserveWithoutPayment: false,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  durationOptions: [],
};

const buildPrisma = () => ({
  service: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(mockService),
    update: jest.fn().mockResolvedValue(mockService),
    findMany: jest.fn().mockResolvedValue([mockService]),
    count: jest.fn().mockResolvedValue(1),
  },
  $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops as Promise<unknown>[])),
});

const buildTenant = (organizationId = DEFAULT_ORG) =>
  ({
    requireOrganizationId: jest.fn().mockReturnValue(organizationId),
    requireOrganizationIdOrDefault: jest.fn().mockReturnValue(organizationId),
  }) as unknown as TenantContextService;

const buildRlsTx = (prisma: Record<string, any>) =>
  ({
    withTransaction: jest.fn((fn: any) => fn(prisma)),
    withBypassTransaction: jest.fn((fn: any) => fn(prisma)),
  }) as unknown as RlsTransactionService;

describe('CreateServiceHandler', () => {
  it('creates service scoped by org when name is unique', async () => {
    const prisma = buildPrisma();
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    const result = await handler.execute({ nameAr: 'قص الشعر', durationMins: 30, price: 50 });
    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
    expect(result.id).toBe('svc-1');
  });

  it('throws ConflictException when name already exists in same org', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService);
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(
      handler.execute({ nameAr: 'قص الشعر', durationMins: 30, price: 50 }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException when depositAmount exceeds price', async () => {
    const prisma = buildPrisma();
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(
      handler.execute({ nameAr: 'خدمة', durationMins: 30, price: 100, depositEnabled: true, depositAmount: 150 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when minParticipants > maxParticipants', async () => {
    const prisma = buildPrisma();
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(
      handler.execute({ nameAr: 'جلسة', durationMins: 60, price: 100, minParticipants: 10, maxParticipants: 5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when reserveWithoutPayment is true but maxParticipants = 1', async () => {
    const prisma = buildPrisma();
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(
      handler.execute({ nameAr: 'خدمة فردية', durationMins: 30, price: 100, maxParticipants: 1, reserveWithoutPayment: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates group session service successfully', async () => {
    const prisma = buildPrisma();
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    const result = await handler.execute({
      nameAr: 'يوغا جماعية', durationMins: 60, price: 100, minParticipants: 3, maxParticipants: 10, reserveWithoutPayment: true,
    });
    expect(result.id).toBe('svc-1');
  });

  it('creates recurring service successfully', async () => {
    const prisma = buildPrisma();
    const handler = new CreateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    const result = await handler.execute({
      nameAr: 'علاج أسبوعي', durationMins: 45, price: 200, allowRecurring: true,
      allowedRecurringPatterns: [RecurringPatternDto.WEEKLY, RecurringPatternDto.BIWEEKLY], maxRecurrences: 12,
    });
    expect(result.id).toBe('svc-1');
  });
});

describe('GetServiceHandler', () => {
  it('returns service scoped by org', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService);
    const handler = new GetServiceHandler(prisma as never, buildTenant());
    const result = await handler.execute({ serviceId: 'svc-1' });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
    expect(result.id).toBe('svc-1');
  });

  it('throws NotFoundException when service not found', async () => {
    const prisma = buildPrisma();
    const handler = new GetServiceHandler(prisma as never, buildTenant());
    await expect(handler.execute({ serviceId: 'missing' })).rejects.toThrow(NotFoundException);
  });
});

const serviceId = 'svc-1';
const mockServiceInactive = { ...mockService, isActive: false };

describe('UpdateServiceHandler', () => {
  it('updates service scoped by org', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService);
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    const result = await handler.execute({ serviceId, durationMins: 45 });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
    expect(result).toEqual(mockService);
  });

  it('throws NotFoundException when service not found', async () => {
    const prisma = buildPrisma();
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(handler.execute({ serviceId: 'missing', durationMins: 45 })).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when depositAmount would exceed updated price', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue({ ...mockService, depositEnabled: true, depositAmount: '80.00' });
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(handler.execute({ serviceId, price: 50 })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when minParticipants would exceed maxParticipants', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue({ ...mockService, maxParticipants: 5 });
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(handler.execute({ serviceId, minParticipants: 10 })).rejects.toThrow(BadRequestException);
  });

  it('emits ServiceDeactivatedEvent when isActive transitions true → false', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService); // isActive: true
    prisma.service.update = jest.fn().mockResolvedValue({ ...mockService, isActive: false });
    const eventBus = buildEventBus();
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ serviceId, isActive: false });

    expect(eventBus.publish).toHaveBeenCalledWith(
      'org-experience.service.deactivated',
      expect.objectContaining({
        payload: { serviceId, organizationId: DEFAULT_ORG },
      }),
    );
  });

  it('emits ServiceReactivatedEvent when isActive transitions false → true', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockServiceInactive); // isActive: false
    prisma.service.update = jest.fn().mockResolvedValue(mockService);
    const eventBus = buildEventBus();
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ serviceId, isActive: true });

    expect(eventBus.publish).toHaveBeenCalledWith(
      'org-experience.service.reactivated',
      expect.objectContaining({
        payload: { serviceId, organizationId: DEFAULT_ORG },
      }),
    );
  });

  it('emits no lifecycle event when isActive does not change', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService); // isActive: true
    prisma.service.update = jest.fn().mockResolvedValue(mockService);
    const eventBus = buildEventBus();
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ serviceId, isActive: true }); // same value

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('emits no lifecycle event when isActive not in payload', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService);
    prisma.service.update = jest.fn().mockResolvedValue(mockService);
    const eventBus = buildEventBus();
    const handler = new UpdateServiceHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ serviceId, durationMins: 45 });

    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe('ListServicesHandler', () => {
  it('returns paginated services scoped by org', async () => {
    const prisma = buildPrisma();
    const handler = new ListServicesHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    const result = await handler.execute({});
    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('excludes hidden services by default', async () => {
    const prisma = buildPrisma();
    const handler = new ListServicesHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await handler.execute({});
    const callArgs = (prisma.service.findMany as jest.Mock).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.isHidden).toBe(false);
  });

  it('includes hidden services when includeHidden = true', async () => {
    const prisma = buildPrisma();
    const handler = new ListServicesHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await handler.execute({ includeHidden: true });
    const callArgs = (prisma.service.findMany as jest.Mock).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.isHidden).toBeUndefined();
  });

  it('adds search OR clause when search is provided', async () => {
    const prisma = buildPrisma();
    const handler = new ListServicesHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await handler.execute({ search: 'قص' });
    const callArgs = (prisma.service.findMany as jest.Mock).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.OR).toBeDefined();
  });
});

describe('ArchiveServiceHandler', () => {
  it('archives service scoped by org', async () => {
    const prisma = buildPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(mockService);
    const handler = new ArchiveServiceHandler(prisma as never, buildTenant());
    const result = await handler.execute({ serviceId: 'svc-1' });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
    expect(result).toEqual(mockService);
  });

  it('throws NotFoundException when service not found', async () => {
    const prisma = buildPrisma();
    const handler = new ArchiveServiceHandler(prisma as never, buildTenant());
    await expect(handler.execute({ serviceId: 'missing' })).rejects.toThrow(NotFoundException);
  });
});

describe('GetServiceBookingConfigsHandler', () => {
  const buildConfigPrisma = () => ({
    service: { findFirst: jest.fn().mockResolvedValue(mockService) },
    serviceBookingConfig: { findMany: jest.fn().mockResolvedValue([]) },
  });

  it('returns configs for service scoped by org', async () => {
    const prisma = buildConfigPrisma();
    const handler = new GetServiceBookingConfigsHandler(prisma as never, buildTenant());
    await handler.execute({ serviceId: 'svc-1' });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
  });

  it('throws NotFoundException when service not found', async () => {
    const prisma = buildConfigPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new GetServiceBookingConfigsHandler(prisma as never, buildTenant());
    await expect(handler.execute({ serviceId: 'bad' })).rejects.toThrow(NotFoundException);
  });
});

describe('SetServiceBookingConfigsHandler', () => {
  const buildConfigPrisma = () => ({
    service: { findFirst: jest.fn().mockResolvedValue(mockService) },
    serviceBookingConfig: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({ id: 'cfg-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops as Promise<unknown>[])),
  });

  it('upserts configs with organizationId scoped by org', async () => {
    const prisma = buildConfigPrisma();
    const handler = new SetServiceBookingConfigsHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await handler.execute({ serviceId: 'svc-1', types: [{ bookingType: ServiceBookingMode.IN_PERSON, price: 100, durationMins: 30 }] });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
  });

  it('throws NotFoundException when service not found', async () => {
    const prisma = buildConfigPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new SetServiceBookingConfigsHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await expect(handler.execute({ serviceId: 'bad', types: [] })).rejects.toThrow(NotFoundException);
  });
});

describe('SetDurationOptionsHandler', () => {
  const buildOptionsPrisma = () => ({
    service: { findFirst: jest.fn().mockResolvedValue(mockService) },
    serviceDurationOption: {
      update: jest.fn().mockResolvedValue({ id: 'opt-1' }),
      create: jest.fn().mockResolvedValue({ id: 'opt-new' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'opt-1' }]),
    },
    $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops as Promise<unknown>[])),
  });

  it('creates new option with organizationId', async () => {
    const prisma = buildOptionsPrisma();
    const rlsTx = buildRlsTx(prisma);
    const handler = new SetDurationOptionsHandler(prisma as never, buildTenant(), rlsTx as never);
    await handler.execute({
      serviceId: 'svc-1',
      options: [{ durationMins: 60, price: 200, currency: 'SAR', label: '60 min', labelAr: '٦٠ دقيقة' }],
    });
    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: DEFAULT_ORG }) }),
    );
    expect(rlsTx.withTransaction).toHaveBeenCalled();
  });

  it('throws NotFoundException when service not found', async () => {
    const prisma = buildOptionsPrisma();
    prisma.service.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new SetDurationOptionsHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await expect(handler.execute({ serviceId: 'bad', options: [] })).rejects.toThrow('not found');
  });
});

describe('SetEmployeeServiceOptionsHandler', () => {
  const buildEsoPrisma = () => ({
    serviceDurationOption: { findMany: jest.fn().mockResolvedValue([{ id: 'opt-1' }]) },
    employeeServiceOption: {
      upsert: jest.fn().mockResolvedValue({ id: 'eso-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops as Promise<unknown>[])),
  });

  it('upserts employee service options with organizationId', async () => {
    const prisma = buildEsoPrisma();
    const rlsTx = buildRlsTx(prisma);
    const handler = new SetEmployeeServiceOptionsHandler(prisma as never, buildTenant(), rlsTx as never);
    await handler.execute({ employeeServiceId: 'es-1', options: [{ durationOptionId: 'opt-1', priceOverride: 300 }] });
    expect(rlsTx.withTransaction).toHaveBeenCalled();
  });

  it('throws NotFoundException when durationOptionId not found', async () => {
    const prisma = buildEsoPrisma();
    prisma.serviceDurationOption.findMany = jest.fn().mockResolvedValue([]);
    const handler = new SetEmployeeServiceOptionsHandler(prisma as never, buildTenant(), buildRlsTx(prisma) as never);
    await expect(handler.execute({ employeeServiceId: 'es-1', options: [{ durationOptionId: 'bad-opt' }] })).rejects.toThrow('not found');
  });
});
