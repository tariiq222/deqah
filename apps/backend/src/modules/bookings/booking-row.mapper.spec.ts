import type { Booking, Client, Employee, Service } from '@prisma/client';
import { mapBookingRow, type BookingRelations } from './booking-row.mapper';

describe('mapBookingRow', () => {
  const mockBooking: Booking = {
    id: 'book-1',
    clientId: 'client-1',
    employeeId: 'emp-1',
    serviceId: 'svc-1',
    employeeServiceId: 'es-1',
    bookingType: 'INDIVIDUAL',
    status: 'PENDING',
    scheduledAt: new Date('2026-05-04T10:00:00Z'),
    endsAt: new Date('2026-05-04T11:00:00Z'),
    price: new (require('decimal.js').Decimal)(100),
    notes: null,
    cancelReason: null,
    cancelledAt: null,
    confirmedAt: null,
    completedAt: null,
    checkedInAt: null,
    zoomJoinUrl: null,
    zoomHostUrl: null,
    zoomStartUrl: null,
    zoomMeetingStatus: null,
    zoomMeetingError: null,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    bookingNumber: 1,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  } as unknown as Booking;

  const mockClient: Client = {
    id: 'client-1',
    tenantId: 'tenant-1',
    name: 'Ahmed Ali',
    firstName: 'Ahmed',
    lastName: 'Ali',
    email: 'ahmed@example.com',
    phone: '+966501234567',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Client;

  const mockEmployee: Employee = {
    id: 'emp-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Dr. Sarah',
    specialty: 'Psychiatry',
    specialtyAr: 'طباعة نفسية',
    branchId: 'branch-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Employee;

  const mockService: Service = {
    id: 'svc-1',
    tenantId: 'tenant-1',
    nameEn: 'Therapy Session',
    nameAr: 'جلسة علاجية',
    price: new (require('decimal.js').Decimal)(100),
    durationMins: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Service;

  const relations: BookingRelations = {
    clientsById: new Map([['client-1', mockClient]]),
    employeesById: new Map([['emp-1', mockEmployee]]),
    servicesById: new Map([['svc-1', mockService]]),
  };

  it('maps basic booking fields', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.id).toBe('book-1');
    expect(result.clientId).toBe('client-1');
    expect(result.employeeId).toBe('emp-1');
    expect(result.serviceId).toBe('svc-1');
  });

  it('derives date from scheduledAt', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.date).toBe('2026-05-04');
  });

  it('derives startTime and endTime from scheduledAt and endsAt', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.startTime).toBe('10:00');
    expect(result.endTime).toBe('11:00');
  });

  it('maps bookingType INDIVIDUAL to in_person', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.type).toBe('in_person');
  });

  it('maps other booking types to lowercase', () => {
    const booking = { ...mockBooking, bookingType: 'GROUP' } as Booking;
    const result = mapBookingRow(booking, relations);

    expect(result.type).toBe('group');
  });

  it('maps status PENDING correctly', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.status).toBe('pending');
  });

  it('maps awaiting_payment status to pending', () => {
    const booking = { ...mockBooking, status: 'AWAITING_PAYMENT' } as Booking;
    const result = mapBookingRow(booking, relations);

    expect(result.status).toBe('pending');
  });

  it('maps pending_group_fill status to pending', () => {
    const booking = { ...mockBooking, status: 'PENDING_GROUP_FILL' } as Booking;
    const result = mapBookingRow(booking, relations);

    expect(result.status).toBe('pending');
  });

  it('maps completed status correctly', () => {
    const booking = { ...mockBooking, status: 'COMPLETED' } as Booking;
    const result = mapBookingRow(booking, relations);

    expect(result.status).toBe('completed');
  });

  it('handles null client gracefully', () => {
    const emptyRelations: BookingRelations = {
      clientsById: new Map(),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, emptyRelations);

    expect(result.client).toBeNull();
  });

  it('handles null employee gracefully', () => {
    const emptyRelations: BookingRelations = {
      clientsById: new Map([['client-1', mockClient]]),
      employeesById: new Map(),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, emptyRelations);

    expect(result.employee).toBeNull();
  });

  it('handles null service gracefully', () => {
    const emptyRelations: BookingRelations = {
      clientsById: new Map([['client-1', mockClient]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map(),
    };

    const result = mapBookingRow(mockBooking, emptyRelations);

    expect(result.service).toBeNull();
  });

  it('maps client with full name to first and last', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.client).toEqual({
      id: 'client-1',
      firstName: 'Ahmed',
      lastName: 'Ali',
      email: 'ahmed@example.com',
      phone: '+966501234567',
    });
  });

  it('maps client with only name (no first/last)', () => {
    const clientWithOnlyName: Client = {
      ...mockClient,
      firstName: null,
      lastName: null,
    };
    const clientRelations: BookingRelations = {
      clientsById: new Map([['client-1', clientWithOnlyName]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, clientRelations);

    expect(result.client?.firstName).toBe('Ahmed');
    expect(result.client?.lastName).toBe('Ali');
  });

  it('handles client with null name and first/last', () => {
    const clientWithAll = {
      ...mockClient,
      name: null,
      firstName: 'First',
      lastName: 'Last',
    } as unknown as Client;
    const clientRelations: BookingRelations = {
      clientsById: new Map([['client-1', clientWithAll]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, clientRelations);

    expect(result.client?.firstName).toBe('First');
    expect(result.client?.lastName).toBe('Last');
  });

  it('maps employee correctly', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.employee).toEqual({
      id: 'emp-1',
      userId: 'user-1',
      user: { firstName: 'Dr.', lastName: 'Sarah' },
      specialty: 'Psychiatry',
      specialtyAr: 'طباعة نفسية',
    });
  });

  it('handles employee with null userId', () => {
    const empNoUser: Employee = { ...mockEmployee, userId: null };
    const empRelations: BookingRelations = {
      clientsById: new Map([['client-1', mockClient]]),
      employeesById: new Map([['emp-1', empNoUser]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, empRelations);

    expect(result.employee?.userId).toBe('');
  });

  it('maps service correctly', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.service).toEqual({
      id: 'svc-1',
      nameAr: 'جلسة علاجية',
      nameEn: 'Therapy Session',
      price: 100,
      duration: 60,
    });
  });

  it('converts price to halalat (multiplies by 100)', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.payment.amount).toBe(10000);
    expect(result.payment.totalAmount).toBe(10000);
  });

  it('handles decimal price correctly', () => {
    const bookingWithDecimal = {
      ...mockBooking,
      price: new (require('decimal.js').Decimal)(99.5),
    };
    const result = mapBookingRow(bookingWithDecimal, relations);

    expect(result.payment.amount).toBe(9950);
  });

  it('handles checkedInAt when present', () => {
    const bookingWithCheckedIn = {
      ...mockBooking,
      checkedInAt: new Date('2026-05-04T09:45:00Z'),
    };

    const result = mapBookingRow(bookingWithCheckedIn, relations);

    expect(result.checkedInAt).toBe('2026-05-04T09:45:00.000Z');
  });

  it('returns null for cancelledAt when not cancelled', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.cancelledAt).toBeNull();
  });

  it('handles cancelled booking', () => {
    const cancelledBooking = {
      ...mockBooking,
      cancelledAt: new Date('2026-05-04T12:00:00Z'),
      cancelReason: 'Client requested',
    } as unknown as Booking;

    const result = mapBookingRow(cancelledBooking, relations);

    expect(result.cancelledAt).toBe('2026-05-04T12:00:00.000Z');
    expect(result.cancellationReason).toBe('Client requested');
  });

  it('handles confirmed booking', () => {
    const confirmedBooking = {
      ...mockBooking,
      confirmedAt: new Date('2026-05-04T09:00:00Z'),
    };

    const result = mapBookingRow(confirmedBooking, relations);

    expect(result.confirmedAt).toBe('2026-05-04T09:00:00.000Z');
  });

  it('handles completed booking', () => {
    const completedBooking = {
      ...mockBooking,
      completedAt: new Date('2026-05-04T11:30:00Z'),
    };

    const result = mapBookingRow(completedBooking, relations);

    expect(result.completedAt).toBe('2026-05-04T11:30:00.000Z');
  });

  it('handles zoom URLs when present', () => {
    const bookingWithZoom = {
      ...mockBooking,
      zoomJoinUrl: 'https://zoom.us/j/123',
      zoomHostUrl: 'https://zoom.us/s/123',
      zoomStartUrl: 'https://zoom.us/start/123',
      zoomMeetingStatus: 'started',
      zoomMeetingError: null,
    } as unknown as Booking;

    const result = mapBookingRow(bookingWithZoom, relations);

    expect(result.zoomJoinUrl).toBe('https://zoom.us/j/123');
    expect(result.zoomHostUrl).toBe('https://zoom.us/s/123');
    expect(result.zoomStartUrl).toBe('https://zoom.us/start/123');
    expect(result.zoomMeetingStatus).toBe('started');
    expect(result.zoomMeetingError).toBeNull();
  });

  it('pads single digit months and days correctly', () => {
    const bookingMay = {
      ...mockBooking,
      scheduledAt: new Date('2026-05-04T10:00:00Z'),
      endsAt: new Date('2026-05-04T11:00:00Z'),
    };

    const result = mapBookingRow(bookingMay, relations);

    expect(result.date).toBe('2026-05-04');
  });

  it('handles employee with null specialty', () => {
    const empNoSpecialty: Employee = { ...mockEmployee, specialty: null, specialtyAr: null };
    const empRelations: BookingRelations = {
      clientsById: new Map([['client-1', mockClient]]),
      employeesById: new Map([['emp-1', empNoSpecialty]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, empRelations);

    expect(result.employee?.specialty).toBe('');
    expect(result.employee?.specialtyAr).toBe('');
  });

  it('handles client with null email and phone', () => {
    const clientNoContact: Client = {
      ...mockClient,
      email: null,
      phone: null,
    };
    const clientRelations: BookingRelations = {
      clientsById: new Map([['client-1', clientNoContact]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, clientRelations);

    expect(result.client?.email).toBe('');
    expect(result.client?.phone).toBeNull();
  });

  it('handles service with null nameEn', () => {
    const serviceNoNameEn: Service = { ...mockService, nameEn: null };
    const svcRelations: BookingRelations = {
      clientsById: new Map([['client-1', mockClient]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', serviceNoNameEn]]),
    };

    const result = mapBookingRow(mockBooking, svcRelations);

    expect(result.service?.nameEn).toBe('');
  });

  it('maps employee name to first/last correctly', () => {
    const result = mapBookingRow(mockBooking, relations);

    expect(result.employee?.user?.firstName).toBe('Dr.');
    expect(result.employee?.user?.lastName).toBe('Sarah');
  });

  it('handles client name with multiple spaces', () => {
    const clientMultipleSpaces: Client = {
      ...mockClient,
      name: 'John    Doe   Smith',
      firstName: null,
      lastName: null,
    };
    const clientRelations: BookingRelations = {
      clientsById: new Map([['client-1', clientMultipleSpaces]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, clientRelations);

    expect(result.client?.firstName).toBe('John');
    expect(result.client?.lastName).toBe('Doe Smith');
  });

  it('handles client name with single word', () => {
    const clientSingleWord: Client = {
      ...mockClient,
      name: 'Madonna',
      firstName: null,
      lastName: null,
    };
    const clientRelations: BookingRelations = {
      clientsById: new Map([['client-1', clientSingleWord]]),
      employeesById: new Map([['emp-1', mockEmployee]]),
      servicesById: new Map([['svc-1', mockService]]),
    };

    const result = mapBookingRow(mockBooking, clientRelations);

    expect(result.client?.firstName).toBe('Madonna');
    expect(result.client?.lastName).toBe('');
  });
});
