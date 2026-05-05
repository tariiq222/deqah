import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateZoomMeetingHandler } from './create-zoom-meeting.handler';
import { buildPrisma, mockBooking } from '../testing/booking-test-helpers';
import { ZoomMeetingStatus } from '@prisma/client';

const buildFeatureCheck = (enabled = true) => ({ isEnabled: jest.fn().mockResolvedValue(enabled) });

const onlineBooking = {
  ...mockBooking,
  bookingType: 'ONLINE' as const,
  organizationId: 'org-1',
};
const zoomIntegration = {
  isActive: true,
  config: { ciphertext: 'cipher' },
};

/** Build a tx mock that mirrors all fields the handler calls on the transaction. */
function buildTx(overrides: Partial<{
  bookingFindFirst: jest.Mock;
  bookingUpdate: jest.Mock;
  integrationFindFirst: jest.Mock;
  orgSettingsFindFirst: jest.Mock;
  queryRaw: jest.Mock;
  executeRaw: jest.Mock;
}> = {}) {
  const bookingUpdate = overrides.bookingUpdate ??
    jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...onlineBooking, ...data }));
  const queryRaw = overrides.queryRaw ?? jest.fn().mockResolvedValue([]);
  const executeRaw = overrides.executeRaw ?? jest.fn().mockResolvedValue(1);

  return {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    booking: {
      findFirst: overrides.bookingFindFirst ?? jest.fn().mockResolvedValue(onlineBooking),
      update: bookingUpdate,
    },
    integration: {
      findFirst: overrides.integrationFindFirst ?? jest.fn().mockResolvedValue(zoomIntegration),
    },
    organizationSettings: {
      findFirst: overrides.orgSettingsFindFirst ?? jest.fn().mockResolvedValue({ timezone: 'Asia/Riyadh' }),
    },
  };
}

function buildMocks(txOverrides: Parameters<typeof buildTx>[0] = {}) {
  const prisma = buildPrisma();

  // Outer (pre-tx) booking read
  prisma.booking.findFirst = jest.fn().mockResolvedValue(onlineBooking);

  // Build tx mock and wire $transaction to invoke callback with it
  const tx = buildTx(txOverrides);
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    (arg: ((t: typeof tx) => Promise<unknown>) | Promise<unknown>[]) => {
      if (typeof arg === 'function') return arg(tx);
      return Promise.all(arg);
    },
  );

  // Keep outer booking.update for feature-disabled path (runs outside tx)
  prisma.booking.update = jest.fn().mockImplementation(
    ({ data }) => Promise.resolve({ ...onlineBooking, ...data }),
  );

  const zoomApi = {
    getAccessToken: jest.fn().mockResolvedValue('token'),
    createMeeting: jest
      .fn()
      .mockResolvedValue({ id: 99, join_url: 'join', start_url: 'start' }),
  };

  const zoomCredentials = {
    decrypt: jest.fn().mockReturnValue({
      zoomClientId: 'cid',
      zoomClientSecret: 'csec',
      zoomAccountId: 'acct',
    }),
  };

  return { prisma, tx, zoomApi, zoomCredentials };
}

describe('CreateZoomMeetingHandler', () => {
  it('throws NotFoundException when booking not found', async () => {
    const { prisma, zoomApi, zoomCredentials } = buildMocks();
    prisma.booking.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await expect(handler.execute({ bookingId: 'bad' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('skips if already CREATED (idempotency) — re-read inside tx returns CREATED', async () => {
    const { prisma, zoomApi, zoomCredentials } = buildMocks({
      bookingFindFirst: jest.fn().mockResolvedValue({
        ...onlineBooking,
        zoomMeetingId: '99',
        zoomMeetingStatus: ZoomMeetingStatus.CREATED,
      }),
    });
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await handler.execute({ bookingId: 'book-1' });

    expect(zoomApi.createMeeting).not.toHaveBeenCalled();
  });

  it('sets FAILED status when Zoom integration not configured', async () => {
    const { prisma, tx, zoomApi, zoomCredentials } = buildMocks({
      integrationFindFirst: jest.fn().mockResolvedValue(null),
    });
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await handler.execute({ bookingId: 'book-1' });

    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zoomMeetingStatus: ZoomMeetingStatus.FAILED,
        }),
      }),
    );
  });

  it('calls Zoom API and updates booking with meeting details on success', async () => {
    const { prisma, tx, zoomApi, zoomCredentials } = buildMocks();
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await handler.execute({ bookingId: 'book-1' });

    expect(zoomApi.createMeeting).toHaveBeenCalled();
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zoomMeetingId: '99',
          zoomMeetingStatus: ZoomMeetingStatus.CREATED,
          zoomStartUrl: 'start',
        }),
      }),
    );
  });

  it('sets FAILED status when Zoom API fails', async () => {
    const { prisma, tx, zoomApi, zoomCredentials } = buildMocks();
    zoomApi.createMeeting.mockRejectedValue(new Error('Zoom Outage'));
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await handler.execute({ bookingId: 'book-1' });

    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zoomMeetingStatus: ZoomMeetingStatus.FAILED,
          zoomMeetingError: 'Zoom Outage',
        }),
      }),
    );
  });

  it('sets FAILED status when ZOOM_INTEGRATION feature is disabled', async () => {
    const { prisma, zoomApi, zoomCredentials } = buildMocks();
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck(false) as never,
    );

    await handler.execute({ bookingId: 'book-1' });

    expect(zoomApi.createMeeting).not.toHaveBeenCalled();
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zoomMeetingStatus: ZoomMeetingStatus.FAILED,
          zoomMeetingError: 'Zoom integration is not available on your current plan',
        }),
      }),
    );
  });

  it('throws BadRequestException when booking is not ONLINE type', async () => {
    const { prisma, zoomApi, zoomCredentials } = buildMocks();
    prisma.booking.findFirst = jest.fn().mockResolvedValue({
      ...onlineBooking,
      bookingType: 'INDIVIDUAL',
    });
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await expect(handler.execute({ bookingId: 'book-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('acquires advisory lock before reading booking inside transaction', async () => {
    const callOrder: string[] = [];
    const executeRaw = jest.fn().mockImplementation(() => {
      callOrder.push('executeRaw');
      return Promise.resolve(1);
    });
    const bookingFindFirst = jest.fn().mockImplementation(() => {
      callOrder.push('bookingFindFirst');
      return Promise.resolve(onlineBooking);
    });

    const { prisma, zoomApi, zoomCredentials } = buildMocks({ executeRaw, bookingFindFirst });
    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    await handler.execute({ bookingId: 'book-1' });

    expect(executeRaw).toHaveBeenCalled();
    // The $executeRaw call must have contained pg_advisory_xact_lock
    const rawCall = executeRaw.mock.calls[0][0] as TemplateStringsArray;
    expect(rawCall.join('')).toContain('pg_advisory_xact_lock');
    // Advisory lock acquired BEFORE tx booking re-read
    expect(callOrder.indexOf('executeRaw')).toBeLessThan(callOrder.indexOf('bookingFindFirst'));
  });

  it('re-reads booking inside transaction and skips Zoom API if status flipped to CREATED between outer read and lock acquisition', async () => {
    // Outer read returns PENDING; tx re-read returns CREATED (race won by another worker)
    const { prisma, zoomApi, zoomCredentials } = buildMocks({
      bookingFindFirst: jest.fn().mockResolvedValue({
        ...onlineBooking,
        zoomMeetingId: '42',
        zoomMeetingStatus: ZoomMeetingStatus.CREATED,
      }),
    });
    // Outer read is still PENDING
    prisma.booking.findFirst = jest.fn().mockResolvedValue(onlineBooking);

    const handler = new CreateZoomMeetingHandler(
      prisma as never,
      zoomApi as never,
      zoomCredentials as never,
      buildFeatureCheck() as never,
    );

    const result = await handler.execute({ bookingId: 'book-1' });

    expect(zoomApi.createMeeting).not.toHaveBeenCalled();
    expect((result as unknown as { zoomMeetingStatus: ZoomMeetingStatus }).zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);
  });
});
