import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { ZoomApiClient } from '../../../infrastructure/zoom/zoom-api.client';
import { ZoomCredentialsService } from '../../../infrastructure/zoom/zoom-credentials.service';
import { FeatureCheckService } from '../../platform/billing/feature-check.service';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { Prisma, ZoomMeetingStatus } from '@prisma/client';

export interface CreateZoomMeetingCommand {
  bookingId: string;
}

/** FNV-1a 32-bit hash → signed int32 (Postgres int4 range) */
function hashToInt32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h | 0;
}

@Injectable()
export class CreateZoomMeetingHandler {
  private readonly logger = new Logger(CreateZoomMeetingHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly zoomApi: ZoomApiClient,
    private readonly zoomCredentials: ZoomCredentialsService,
    private readonly featureCheck: FeatureCheckService,
  ) {}

  async execute(cmd: CreateZoomMeetingCommand) {
    // Step 1: initial read outside tx — needed to derive the lock key
    const booking = await this.prisma.booking.findFirst({
      where: { id: cmd.bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${cmd.bookingId} not found`);
    }

    // Step 2: feature gate — safe outside tx, early-exit with no race concern
    if (!(await this.featureCheck.isEnabled(booking.organizationId, FeatureKey.ZOOM_INTEGRATION))) {
      this.logger.debug(
        `feature_disabled_skip: org=${booking.organizationId} feature=ZOOM_INTEGRATION`,
      );
      return this.prisma.booking.update({
        where: { id: cmd.bookingId },
        data: {
          zoomMeetingStatus: ZoomMeetingStatus.FAILED,
          zoomMeetingError: 'Zoom integration is not available on your current plan',
        },
      });
    }

    // Step 3: booking-type validation — pure, no race concern
    if (booking.bookingType !== 'ONLINE') {
      throw new BadRequestException(
        'Zoom meetings can only be created for ONLINE bookings',
      );
    }

    const key1 = hashToInt32(booking.organizationId);
    const key2 = hashToInt32(booking.id);

    // Step 4: advisory-locked critical section — holds lock + connection for Zoom API duration; bounded per-booking concurrency makes this acceptable.
    return this.rlsTx.withTransaction(async (tx) => {
      // 4a: acquire per-(org, booking) advisory lock before any read/write
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key1}::int, ${key2}::int)`;

      // 4b: re-read booking now that lock is held — another worker may have completed between step 1 and here
      const freshBooking = await tx.booking.findFirst({
        where: { id: cmd.bookingId },
      });
      if (!freshBooking) {
        throw new NotFoundException(`Booking ${cmd.bookingId} not found`);
      }

      // 4c: idempotency check on freshly-read booking
      if (
        freshBooking.zoomMeetingId &&
        freshBooking.zoomMeetingStatus === ZoomMeetingStatus.CREATED
      ) {
        return freshBooking;
      }

      // 4d: load zoom integration inside tx
      const integration = await tx.integration.findFirst({
        where: { provider: 'zoom' },
      });
      if (!integration || !integration.isActive) {
        this.logger.warn(`Zoom integration not configured for booking ${freshBooking.id}`);
        return tx.booking.update({
          where: { id: cmd.bookingId },
          data: {
            zoomMeetingStatus: ZoomMeetingStatus.FAILED,
            zoomMeetingError: 'Zoom integration is not configured for this clinic',
          },
        });
      }

      // 4e: ciphertext validation
      const config = integration.config as { ciphertext?: string } | null;
      const ciphertext = config?.ciphertext;

      if (!ciphertext) {
        this.logger.error(`Zoom config missing ciphertext for org ${freshBooking.organizationId}`);
        return tx.booking.update({
          where: { id: cmd.bookingId },
          data: {
            zoomMeetingStatus: ZoomMeetingStatus.FAILED,
            zoomMeetingError: 'Zoom integration configuration is invalid',
          },
        });
      }

      // 4f: decrypt → token → createMeeting → update
      try {
        const { zoomClientId, zoomClientSecret, zoomAccountId } =
          this.zoomCredentials.decrypt<{
            zoomClientId: string;
            zoomClientSecret: string;
            zoomAccountId: string;
          }>(ciphertext, freshBooking.organizationId);

        const settings = await tx.organizationSettings.findFirst({
          where: { organizationId: freshBooking.organizationId },
        });
        const timezone = settings?.timezone || 'Asia/Riyadh';

        const token = await this.zoomApi.getAccessToken(
          freshBooking.organizationId,
          zoomClientId,
          zoomClientSecret,
          zoomAccountId,
        );

        const meeting = await this.zoomApi.createMeeting(
          token,
          {
            topic: `Booking ${freshBooking.id}`,
            startTime: freshBooking.scheduledAt.toISOString(),
            durationMins: freshBooking.durationMins,
          },
          timezone,
        );

        return await tx.booking.update({
          where: { id: cmd.bookingId },
          data: {
            zoomMeetingId: String(meeting.id),
            zoomJoinUrl: meeting.join_url,
            zoomHostUrl: meeting.start_url,
            zoomStartUrl: meeting.start_url,
            zoomMeetingStatus: ZoomMeetingStatus.CREATED,
            zoomMeetingCreatedAt: new Date(),
            zoomMeetingError: null,
          },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        this.logger.error(
          `Failed to create Zoom meeting for booking ${freshBooking.id}: ${message}`,
        );
        return await tx.booking.update({
          where: { id: cmd.bookingId },
          data: {
            zoomMeetingStatus: ZoomMeetingStatus.FAILED,
            zoomMeetingError: message,
          },
        });
      }
    });
  }
}
