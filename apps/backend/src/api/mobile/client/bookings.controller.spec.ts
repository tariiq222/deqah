import { CancellationReason } from '@prisma/client';
import { MobileClientBookingsController, MobileCreateBookingDto, MobileCancelBookingDto, MobileListBookingsDto } from './bookings.controller';

const USER = { id: 'client-1', email: 'client@test.com', phone: null };

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const list = fn({ data: [], meta: {} });
  const get = fn({ id: 'booking-1' });
  const create = fn({ id: 'booking-1' });
  const cancel = fn({ id: 'booking-1', status: 'cancelled' });
  const reschedule = fn({ id: 'booking-1', scheduledAt: new Date() });
  const rate = fn({ id: 'rating-1' });
  const prisma = { booking: { findFirst: jest.fn() } };
  const zoom = fn({ zoomJoinUrl: 'https://zoom.us/j/123', scheduledAt: new Date() });
  const controller = new MobileClientBookingsController(
    list as never, get as never, create as never, cancel as never, reschedule as never,
    rate as never, prisma as never, zoom as never,
  );
  return { controller, list, get, create, cancel, reschedule, rate, prisma, zoom };
}

describe('MobileClientBookingsController', () => {
  describe('createBooking', () => {
    it('passes clientId and booking fields to handler', async () => {
      const { controller, create } = buildController();
      const body: MobileCreateBookingDto = {
        branchId: 'branch-1',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        scheduledAt: '2026-07-01T10:00:00Z',
      };
      await controller.createBooking(USER as never, body);
      expect(create.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: USER.id,
          branchId: body.branchId,
          employeeId: body.employeeId,
          serviceId: body.serviceId,
          scheduledAt: expect.any(Date),
        }),
      );
    });

    it('converts scheduledAt to Date', async () => {
      const { controller, create } = buildController();
      await controller.createBooking(USER as never, {
        branchId: 'branch-1', employeeId: 'emp-1', serviceId: 'svc-1', scheduledAt: '2026-07-01T10:00:00Z',
      });
      expect(create.execute).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: expect.any(Date) }),
      );
    });

    it('passes optional durationOptionId and notes', async () => {
      const { controller, create } = buildController();
      await controller.createBooking(USER as never, {
        branchId: 'branch-1', employeeId: 'emp-1', serviceId: 'svc-1', scheduledAt: '2026-07-01T10:00:00Z',
        durationOptionId: 'dur-1', notes: 'please be gentle',
      });
      expect(create.execute).toHaveBeenCalledWith(
        expect.objectContaining({ durationOptionId: 'dur-1', notes: 'please be gentle' }),
      );
    });
  });

  describe('listMyBookings', () => {
    it('passes clientId and pagination defaults', async () => {
      const { controller, list } = buildController();
      await controller.listMyBookings(USER as never, {});
      expect(list.execute).toHaveBeenCalledWith({
        clientId: USER.id, page: 1, limit: 20, status: undefined,
      });
    });

    it('uses query params for page, limit, and status', async () => {
      const { controller, list } = buildController();
      const q: MobileListBookingsDto = { page: 3, limit: 50, status: 'CONFIRMED' };
      await controller.listMyBookings(USER as never, q);
      expect(list.execute).toHaveBeenCalledWith({
        clientId: USER.id, page: 3, limit: 50, status: 'CONFIRMED',
      });
    });
  });

  describe('getBooking', () => {
    it('passes bookingId and clientId to handler', async () => {
      const { controller, get } = buildController();
      await controller.getBooking(USER as never, 'booking-123');
      expect(get.execute).toHaveBeenCalledWith({ bookingId: 'booking-123', clientId: 'client-1' });
    });
  });

  describe('cancelBooking', () => {
    it('passes bookingId, reason, cancelNotes, changedBy, source, and clientId', async () => {
      const { controller, cancel } = buildController();
      const body: MobileCancelBookingDto = { reason: CancellationReason.CLIENT_REQUESTED, cancelNotes: 'changed mind' };
      await controller.cancelBooking(USER as never, 'booking-1', body);
      expect(cancel.execute).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        reason: CancellationReason.CLIENT_REQUESTED,
        cancelNotes: 'changed mind',
        changedBy: USER.id,
        source: 'client',
        clientId: USER.id,
      });
    });

    it('works without cancelNotes', async () => {
      const { controller, cancel } = buildController();
      await controller.cancelBooking(USER as never, 'booking-1', { reason: CancellationReason.OTHER });
      expect(cancel.execute).toHaveBeenCalledWith(
        expect.objectContaining({ cancelNotes: undefined, source: 'client', clientId: USER.id }),
      );
    });
  });

  describe('rescheduleBooking', () => {
    it('passes bookingId, newScheduledAt, newDurationMins, changedBy, and clientId', async () => {
      const { controller, reschedule } = buildController();
      const body = { newScheduledAt: '2026-07-15T14:00:00Z', newDurationMins: 60 };
      await controller.rescheduleBooking(USER as never, 'booking-1', body as never);
      expect(reschedule.execute).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        newScheduledAt: expect.any(Date),
        newDurationMins: 60,
        changedBy: USER.id,
        clientId: USER.id,
      });
    });

    it('converts newScheduledAt to Date', async () => {
      const { controller, reschedule } = buildController();
      await controller.rescheduleBooking(USER as never, 'booking-1', { newScheduledAt: '2026-07-15T14:00:00Z' } as never);
      expect(reschedule.execute).toHaveBeenCalledWith(
        expect.objectContaining({ newScheduledAt: expect.any(Date) }),
      );
    });
  });
});
