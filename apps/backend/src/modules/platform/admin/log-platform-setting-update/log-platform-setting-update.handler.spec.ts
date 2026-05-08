import { Test } from '@nestjs/testing';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { LogPlatformSettingUpdateHandler } from './log-platform-setting-update.handler';

describe('LogPlatformSettingUpdateHandler', () => {
  let handler: LogPlatformSettingUpdateHandler;
  let prisma: { $allTenants: { superAdminActionLog: { create: jest.Mock } } };

  beforeEach(async () => {
    prisma = {
      $allTenants: { superAdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'log_1' }) } },
    };
    const module = await Test.createTestingModule({
      providers: [
        LogPlatformSettingUpdateHandler,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    handler = module.get(LogPlatformSettingUpdateHandler);
  });

  it('writes a SuperAdminActionLog row with PLATFORM_SETTING_UPDATED action type', async () => {
    await handler.execute({
      superAdminUserId: 'user_1',
      settingKey: 'platform.brand.primaryColor',
      previousValue: '#354FD8',
      nextValue: '#FF0000',
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });

    expect(prisma.$allTenants.superAdminActionLog.create).toHaveBeenCalledWith({
      data: {
        superAdminUserId: 'user_1',
        actionType: SuperAdminActionType.PLATFORM_SETTING_UPDATED,
        reason: 'Platform setting updated: platform.brand.primaryColor',
        metadata: {
          settingKey: 'platform.brand.primaryColor',
          previousValue: '#354FD8',
          nextValue: '#FF0000',
        },
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      },
    });
  });

  it('redacts secret values when settingIsSecret=true', async () => {
    await handler.execute({
      superAdminUserId: 'user_1',
      settingKey: 'billing.moyasar.platformSecretKey',
      previousValue: 'sk_test_old',
      nextValue: 'sk_test_new',
      settingIsSecret: true,
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });

    expect(prisma.$allTenants.superAdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            settingKey: 'billing.moyasar.platformSecretKey',
            previousValue: '***',
            nextValue: '***',
          }),
        }),
      }),
    );
  });
});
