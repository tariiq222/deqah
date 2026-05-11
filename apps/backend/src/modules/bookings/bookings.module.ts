import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database';
import { MessagingModule } from '../../infrastructure/messaging.module';
import { TenantModule } from '../../common/tenant';
import { OrgExperienceModule } from '../org-experience/org-experience.module';
import { FinanceModule } from '../finance/finance.module';
import { CreateBookingHandler } from './create-booking/create-booking.handler';
import { CreateRecurringBookingHandler } from './create-recurring-booking/create-recurring-booking.handler';
import { CancelBookingHandler } from './cancel-booking/cancel-booking.handler';
import { RescheduleBookingHandler } from './reschedule-booking/reschedule-booking.handler';
import { ConfirmBookingHandler } from './confirm-booking/confirm-booking.handler';
import { AddToWaitlistHandler } from './add-to-waitlist/add-to-waitlist.handler';
import { ListWaitlistHandler } from './list-waitlist/list-waitlist.handler';
import { RemoveWaitlistEntryHandler } from './remove-waitlist-entry/remove-waitlist-entry.handler';
import { GetBookingHandler } from './get-booking/get-booking.handler';
import { ListBookingsHandler } from './list-bookings/list-bookings.handler';
import { BookingsStatsHandler } from './bookings-stats/bookings-stats.handler';
import { CheckAvailabilityHandler } from './check-availability/check-availability.handler';
import { CheckInBookingHandler } from './check-in-booking/check-in-booking.handler';
import { CompleteBookingHandler } from './complete-booking/complete-booking.handler';
import { NoShowBookingHandler } from './no-show-booking/no-show-booking.handler';
import { ExpireBookingHandler } from './expire-booking/expire-booking.handler';
import { ListBookingStatusLogHandler } from './list-booking-status-log/list-booking-status-log.handler';
import { PaymentCompletedEventHandler } from './payment-completed-handler/payment-completed.handler';
import { GetBookingSettingsHandler } from './get-booking-settings/get-booking-settings.handler';
import { UpsertBookingSettingsHandler } from './upsert-booking-settings/upsert-booking-settings.handler';
import { RequestCancelBookingHandler } from './request-cancel-booking/request-cancel-booking.handler';
import { ApproveCancelBookingHandler } from './approve-cancel-booking/approve-cancel-booking.handler';
import { RejectCancelBookingHandler } from './reject-cancel-booking/reject-cancel-booking.handler';
import { CreateZoomMeetingHandler } from './create-zoom-meeting/create-zoom-meeting.handler';
import { RetryZoomMeetingHandler } from './retry-zoom-meeting/retry-zoom-meeting.handler';
import { ZoomMeetingService } from './zoom-meeting.service';
import { ZoomModule } from '../integrations/zoom/zoom.module';
import { BillingModule } from '../platform/billing/billing.module';
import { GroupSessionMinReachedHandler } from './group-session-min-reached/group-session-min-reached.handler';
import { DashboardBookingsController } from '../../api/dashboard/bookings.controller';
import { GetPublicAvailabilityHandler } from './availability/public/get-public-availability.handler';
import { CreateGuestBookingHandler } from './public/create-guest-booking.handler';
import { ListClientBookingsHandler } from './client/list-client-bookings.handler';
import { ClientCancelBookingHandler } from './client/client-cancel-booking.handler';
import { ClientRescheduleBookingHandler } from './client/client-reschedule-booking.handler';
import { ListPublicGroupSessionsHandler } from './public/list-public-group-sessions.handler';
import { GetPublicGroupSessionHandler } from './public/get-public-group-session.handler';
import { BookGroupSessionHandler } from './public/book-group-session.handler';
import { CreateEmployeeBookingHandler } from './create-employee-booking/create-employee-booking.handler';
import { ValidateCouponService } from './coupons/validate-coupon.service';

const handlers = [
  CreateBookingHandler,
  CreateEmployeeBookingHandler,
  CreateRecurringBookingHandler,
  CancelBookingHandler,
  RescheduleBookingHandler,
  ConfirmBookingHandler,
  AddToWaitlistHandler,
  ListWaitlistHandler,
  RemoveWaitlistEntryHandler,
  GetBookingHandler,
  ListBookingsHandler,
  BookingsStatsHandler,
  CheckAvailabilityHandler,
  CheckInBookingHandler,
  CompleteBookingHandler,
  NoShowBookingHandler,
  ExpireBookingHandler,
  ListBookingStatusLogHandler,
  GetBookingSettingsHandler,
  UpsertBookingSettingsHandler,
  RequestCancelBookingHandler,
  ApproveCancelBookingHandler,
  RejectCancelBookingHandler,
  CreateZoomMeetingHandler,
  RetryZoomMeetingHandler,
  ZoomMeetingService,
  GroupSessionMinReachedHandler,
  GetPublicAvailabilityHandler,
  CreateGuestBookingHandler,
  ListClientBookingsHandler,
  ClientCancelBookingHandler,
  ClientRescheduleBookingHandler,
  ListPublicGroupSessionsHandler,
  GetPublicGroupSessionHandler,
  BookGroupSessionHandler,
  ValidateCouponService,
];

@Module({
  imports: [
    DatabaseModule,
    MessagingModule,
    TenantModule,
    OrgExperienceModule,
    ZoomModule,
    BillingModule,
    FinanceModule,
  ],
  controllers: [DashboardBookingsController],
  providers: [...handlers, PaymentCompletedEventHandler],
  exports: [...handlers, CheckAvailabilityHandler, ListClientBookingsHandler, ClientCancelBookingHandler, ClientRescheduleBookingHandler, ValidateCouponService],
})
export class BookingsModule implements OnModuleInit {
  constructor(private readonly paymentCompletedHandler: PaymentCompletedEventHandler) {}

  onModuleInit(): void {
    this.paymentCompletedHandler.register();
  }
}
