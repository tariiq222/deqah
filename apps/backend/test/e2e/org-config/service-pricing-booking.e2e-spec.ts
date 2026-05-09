import SuperTest from 'supertest';
import { createTestApp, closeTestApp } from '../../setup/app.setup';
import { testPrisma, cleanTables } from '../../setup/db.setup';
import {
  seedClient,
  seedEmployee,
  seedService,
  seedBranch,
  seedEmployeeService,
} from '../../setup/seed.helper';
import { createTestToken, adminUser, ensureTestUsers } from '../../setup/auth.helper';
import type { PrismaClient } from '@prisma/client';

describe('Service Pricing & Duration in Booking (e2e)', () => {
  let req: SuperTest.Agent;
  let TOKEN: string;
  let branchId: string;
  let employeeId: string;
  let clientId: string;
  let serviceId: string;

  beforeAll(async () => {
    ({ request: req } = await createTestApp());
    await ensureTestUsers();
    TOKEN = createTestToken(adminUser);
    await cleanTables([
      'Booking',
      'Invoice',
      'Client',
      'Employee',
      'Service',
      'Branch',
      'EmployeeService',
      'ServiceDurationOption',
    ]);

    const [client, employee, service, branch] = await Promise.all([
      seedClient(testPrisma as unknown as PrismaClient),
      seedEmployee(testPrisma as never, { name: 'Dr. Pricing' }),
      seedService(testPrisma as never, {
        nameAr: 'استشارة التسعير',
        durationMins: 30,
        price: 100,
      }),
      seedBranch(testPrisma as never, { nameAr: 'فرع التسعير' }),
    ]);

    clientId = client.id;
    employeeId = employee.id;
    serviceId = service.id;
    branchId = branch.id;

    await seedEmployeeService(testPrisma as never, employeeId, serviceId);
  });

  afterAll(async () => {
    await cleanTables([
      'Booking',
      'Invoice',
      'Client',
      'Employee',
      'Service',
      'Branch',
      'EmployeeService',
      'ServiceDurationOption',
    ]);
    await closeTestApp();
  });

  it('[PRICE-001][Service/pricing][P1-High] booking uses service base price and duration', async () => {
    const bookingRes = await req
      .post('/dashboard/bookings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        clientId,
        employeeId,
        serviceId,
        branchId,
        scheduledAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        bookingType: 'INDIVIDUAL',
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.price).toBe(100);
    expect(bookingRes.body.durationMins).toBe(30);

    const inDb = await (testPrisma as unknown as PrismaClient).booking.findUnique({
      where: { id: bookingRes.body.id },
      select: { price: true, durationMins: true },
    });
    expect(Number(inDb!.price)).toBe(100);
    expect(inDb!.durationMins).toBe(30);
  });

  it('[PRICE-002][Service/pricing][P1-High] booking with duration option uses option price and duration', async () => {
    const option = await (testPrisma as unknown as PrismaClient).serviceDurationOption.create({
      data: {
        organizationId: '00000000-0000-0000-0000-000000000001',
        serviceId,
        label: 'Extended Session',
        labelAr: 'جلسة ممتدة',
        durationMins: 90,
        price: 250,
        currency: 'SAR',
        isDefault: true,
        isActive: true,
      },
    });

    const bookingRes = await req
      .post('/dashboard/bookings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        clientId,
        employeeId,
        serviceId,
        branchId,
        scheduledAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        bookingType: 'INDIVIDUAL',
        durationOptionId: option.id,
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.price).toBe(250);
    expect(bookingRes.body.durationMins).toBe(90);
    expect(bookingRes.body.durationOptionId).toBe(option.id);
  });

  it('[PRICE-003][Service/pricing][P2-Medium] invoice reflects booking price with VAT', async () => {
    const bookingRes = await req
      .post('/dashboard/bookings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        clientId,
        employeeId,
        serviceId,
        branchId,
        scheduledAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
        bookingType: 'INDIVIDUAL',
      });

    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.id;

    const invoice = await (testPrisma as unknown as PrismaClient).invoice.findUnique({
      where: { bookingId },
      select: { subtotal: true, vatAmt: true, total: true, vatRate: true },
    });

    expect(invoice).not.toBeNull();
    expect(Number(invoice!.subtotal)).toBe(100);
    expect(Number(invoice!.vatRate)).toBe(0.15);
    expect(Number(invoice!.vatAmt)).toBe(15);
    expect(Number(invoice!.total)).toBe(115);
  });

  it('[PRICE-004][Service/pricing][P1-High] booking rejected when employee does not provide service', async () => {
    const otherEmployee = await seedEmployee(testPrisma as never, {
      name: 'Other Employee',
    });

    const bookingRes = await req
      .post('/dashboard/bookings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        clientId,
        employeeId: otherEmployee.id,
        serviceId,
        branchId,
        scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        bookingType: 'INDIVIDUAL',
      });

    expect(bookingRes.status).toBe(400);
    expect(bookingRes.body.message).toMatch(/employee.*service/i);
  });

  it('[PRICE-005][Service/pricing][P1-High] 401 without JWT', async () => {
    const bookingRes = await req
      .post('/dashboard/bookings')
      .send({
        clientId,
        employeeId,
        serviceId,
        branchId,
        scheduledAt: new Date(Date.now() + 8 * 86_400_000).toISOString(),
        bookingType: 'INDIVIDUAL',
      });

    expect(bookingRes.status).toBe(401);
  });
});