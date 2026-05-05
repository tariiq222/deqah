import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Default org id — matches the seed planted in the SaaS-01 migration.
// Keep every seed row under this org so per-org uniques remain deterministic.
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

export async function seedUser(
  prisma: PrismaClient,
  overrides: Partial<{
    email: string;
    password: string;
    role: string;
    name: string;
    isActive: boolean;
  }> = {},
) {
  const email = overrides.email ?? `user-${Date.now()}@test.com`;
  const password = overrides.password ?? 'Test@1234';
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      name: overrides.name ?? 'Test User',
      role: (overrides.role as never) ?? 'RECEPTIONIST',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function seedClient(
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    firstName: string;
    lastName: string;
    phone: string;
    isActive: boolean;
  }> = {},
) {
  const name = overrides.name ?? 'Test Client';
  const [firstToken, ...rest] = name.split(' ');
  return prisma.client.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      name,
      firstName: overrides.firstName ?? firstToken ?? 'Test',
      lastName: overrides.lastName ?? (rest.join(' ') || 'Client'),
      phone: overrides.phone ?? `+9665${Date.now().toString().slice(-8)}`,
      isActive: overrides.isActive ?? true,
      source: 'WALK_IN',
    },
  });
}

export async function seedEmployee(
  prisma: PrismaClient,
  overrides: Partial<{ name: string; isActive: boolean }> = {},
) {
  return prisma.employee.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      name: overrides.name ?? 'Test Employee',
      isActive: overrides.isActive ?? true,
      employmentType: 'FULL_TIME',
    },
  });
}

export async function seedService(
  prisma: PrismaClient,
  overrides: Partial<{ nameAr: string; nameEn: string; durationMins: number; price: number }> = {},
) {
  return prisma.service.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      nameAr: overrides.nameAr ?? 'Test Service',
      nameEn: overrides.nameEn,
      durationMins: overrides.durationMins ?? 60,
      price: overrides.price ?? 200,
      currency: 'SAR',
      isActive: true,
    },
  });
}

export async function seedBranch(
  prisma: PrismaClient,
  overrides: Partial<{ nameAr: string; nameEn: string }> = {},
) {
  return prisma.branch.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      nameAr: overrides.nameAr ?? 'Main Branch',
      nameEn: overrides.nameEn,
      isActive: true,
    },
  });
}

export async function seedEmployeeService(
  prisma: PrismaClient,
  employeeId: string,
  serviceId: string,
) {
  return prisma.employeeService.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      employeeId,
      serviceId,
    },
  });
}

export async function seedBooking(
  prisma: PrismaClient,
  opts: {
    clientId: string;
    employeeId: string;
    serviceId: string;
    branchId: string;
    scheduledAt?: Date;
    status?: string;
  },
) {
  const scheduledAt = opts.scheduledAt ?? new Date(Date.now() + 86_400_000);
  const endsAt = new Date(scheduledAt.getTime() + 3_600_000);

  return prisma.booking.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      clientId: opts.clientId,
      employeeId: opts.employeeId,
      serviceId: opts.serviceId,
      branchId: opts.branchId,
      scheduledAt,
      endsAt,
      durationMins: 60,
      price: 200,
      currency: 'SAR',
      status: (opts.status as never) ?? 'PENDING',
      bookingType: 'INDIVIDUAL',
      bookingNumber: Date.now(),
    },
  });
}

/**
 * Seeds EmployeeAvailability rows for all 7 days of the week (0=Sun..6=Sat).
 * Default working hours: 09:00–17:00. Override via opts.
 */
export async function seedEmployeeAvailability(
  prisma: PrismaClient,
  employeeId: string,
  opts: Partial<{ startTime: string; endTime: string }> = {},
) {
  const startTime = opts.startTime ?? '09:00';
  const endTime = opts.endTime ?? '17:00';
  return Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) =>
      prisma.employeeAvailability.create({
        data: {
          organizationId: DEFAULT_ORG_ID,
          employeeId,
          dayOfWeek,
          startTime,
          endTime,
          isActive: true,
        },
      }),
    ),
  );
}

/**
 * Seeds all prerequisites for a booking test in one call.
 * Returns { client, employee, service, branch, employeeService, availability }.
 */
export async function seedBookingPrereqs(
  prisma: PrismaClient,
  opts: Partial<{
    serviceName: string;
    branchName: string;
    employeeName: string;
    durationMins: number;
    price: number;
  }> = {},
) {
  const client = await seedClient(prisma);
  const employee = await seedEmployee(prisma, {
    name: opts.employeeName ?? 'Prereq Employee',
  });
  const service = await seedService(prisma, {
    nameAr: opts.serviceName ?? 'Prereq Service',
    durationMins: opts.durationMins ?? 60,
    price: opts.price ?? 200,
  });
  const branch = await seedBranch(prisma, {
    nameAr: opts.branchName ?? 'Prereq Branch',
  });
  const employeeService = await seedEmployeeService(prisma, employee.id, service.id);
  const availability = await seedEmployeeAvailability(prisma, employee.id);
  return { client, employee, service, branch, employeeService, availability };
}

/**
 * Seeds a minimal Department row scoped to the default org.
 */
export async function seedDepartment(
  prisma: PrismaClient,
  branchId: string,
  overrides: Partial<{ nameAr: string; nameEn: string }> = {},
) {
  return prisma.department.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      nameAr: overrides.nameAr ?? `Test Department ${Date.now()}`,
      nameEn: overrides.nameEn,
      isActive: true,
    },
  });
}
