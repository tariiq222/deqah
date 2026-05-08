import { Request } from 'express';
import { BrandingSettingsController } from './branding-settings.controller';
import { PlatformSettingsService } from '../../modules/platform/settings/platform-settings.service';
import { LogPlatformSettingUpdateHandler } from '../../modules/platform/admin/log-platform-setting-update/log-platform-setting-update.handler';

describe('BrandingSettingsController', () => {
  let controller: BrandingSettingsController;
  let mockSettings: Partial<PlatformSettingsService>;
  let mockLogHandler: { execute: jest.Mock };
  let req: Request;

  beforeEach(() => {
    mockSettings = {
      get: jest.fn(),
      set: jest.fn(),
    };
    mockLogHandler = { execute: jest.fn().mockResolvedValue(undefined) };
    controller = new BrandingSettingsController(
      mockSettings as PlatformSettingsService,
      mockLogHandler as unknown as LogPlatformSettingUpdateHandler,
    );
    req = { ip: '1.2.3.4', socket: { remoteAddress: '1.2.3.4' }, headers: { 'user-agent': 'jest' } } as unknown as Request;
  });

  describe('getBrand', () => {
    it('returns default values when settings are null', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);

      const result = await controller.getBrand();

      expect(result).toEqual({
        logoUrl: '',
        primaryColor: '#354FD8',
        accentColor: '#82CC17',
        locale: {
          default: 'ar',
          rtlDefault: true,
          dateFormat: 'dd/MM/yyyy',
          currencyFormat: 'SAR',
        },
      });
    });

    it('returns actual values when settings exist', async () => {
      mockSettings.get = jest.fn()
        .mockResolvedValueOnce('https://example.com/logo.png')
        .mockResolvedValueOnce('#FF0000')
        .mockResolvedValueOnce('#00FF00')
        .mockResolvedValueOnce('en')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce('MM/dd/yyyy')
        .mockResolvedValueOnce('USD');

      const result = await controller.getBrand();

      expect(result).toEqual({
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#FF0000',
        accentColor: '#00FF00',
        locale: {
          default: 'en',
          rtlDefault: false,
          dateFormat: 'MM/dd/yyyy',
          currencyFormat: 'USD',
        },
      });
    });

    it('uses correct settings keys', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);

      await controller.getBrand();

      expect(mockSettings.get).toHaveBeenCalledWith('platform.brand.logoUrl');
      expect(mockSettings.get).toHaveBeenCalledWith('platform.brand.primaryColor');
      expect(mockSettings.get).toHaveBeenCalledWith('platform.brand.accentColor');
      expect(mockSettings.get).toHaveBeenCalledWith('platform.locale.default');
      expect(mockSettings.get).toHaveBeenCalledWith('platform.locale.rtlDefault');
      expect(mockSettings.get).toHaveBeenCalledWith('platform.locale.dateFormat');
      expect(mockSettings.get).toHaveBeenCalledWith('platform.locale.currencyFormat');
    });
  });

  describe('updateBrand', () => {
    it('updates logoUrl', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ logoUrl: 'https://example.com/new-logo.png' }, user, req);

      expect(mockSettings.set).toHaveBeenCalledWith('platform.brand.logoUrl', 'https://example.com/new-logo.png', 'user-1');
    });

    it('updates primaryColor', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ primaryColor: '#000000' }, user, req);

      expect(mockSettings.set).toHaveBeenCalledWith('platform.brand.primaryColor', '#000000', 'user-1');
    });

    it('updates accentColor', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ accentColor: '#FFFFFF' }, user, req);

      expect(mockSettings.set).toHaveBeenCalledWith('platform.brand.accentColor', '#FFFFFF', 'user-1');
    });

    it('updates nested locale fields', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({
        locale: {
          default: 'fr',
          rtlDefault: false,
          dateFormat: 'yyyy-MM-dd',
          currencyFormat: 'EUR',
        },
      }, user, req);

      expect(mockSettings.set).toHaveBeenCalledWith('platform.locale.default', 'fr', 'user-1');
      expect(mockSettings.set).toHaveBeenCalledWith('platform.locale.rtlDefault', false, 'user-1');
      expect(mockSettings.set).toHaveBeenCalledWith('platform.locale.dateFormat', 'yyyy-MM-dd', 'user-1');
      expect(mockSettings.set).toHaveBeenCalledWith('platform.locale.currencyFormat', 'EUR', 'user-1');
    });

    it('updates multiple fields at once', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#FF0000',
        accentColor: '#00FF00',
        locale: { default: 'en' },
      }, user, req);

      expect(mockSettings.set).toHaveBeenCalledTimes(4);
      expect(mockLogHandler.execute).toHaveBeenCalledTimes(4);
    });

    it('ignores unknown fields', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ unknownField: 'value' } as never, user, req);

      expect(mockSettings.set).not.toHaveBeenCalled();
    });

    it('returns updated true', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      const result = await controller.updateBrand({ logoUrl: 'test' }, user, req);

      expect(result).toEqual({ updated: true });
    });

    it('handles partial locale updates', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({
        locale: { default: 'de' },
      }, user, req);

      expect(mockSettings.set).toHaveBeenCalledTimes(1);
      expect(mockSettings.set).toHaveBeenCalledWith('platform.locale.default', 'de', 'user-1');
    });

    it('does not update locale if locale is not an object', async () => {
      mockSettings.get = jest.fn().mockResolvedValue(null);
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ locale: 'not-an-object' } as never, user, req);

      expect(mockSettings.set).not.toHaveBeenCalled();
    });
  });

  describe('audit logging', () => {
    it('writes a PLATFORM_SETTING_UPDATED row for every changed key', async () => {
      mockSettings.get = jest.fn().mockResolvedValue('#354FD8');  // previous primary color
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ primaryColor: '#FF0000' }, user, req);

      expect(mockLogHandler.execute).toHaveBeenCalledWith({
        superAdminUserId: 'user-1',
        settingKey: 'platform.brand.primaryColor',
        previousValue: '#354FD8',
        nextValue: '#FF0000',
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      });
    });

    it('skips audit log + set when previousValue === nextValue (no-op update)', async () => {
      mockSettings.get = jest.fn().mockResolvedValue('#354FD8');  // same as next
      mockSettings.set = jest.fn().mockResolvedValue(undefined);
      const user = { sub: 'user-1' } as never;

      await controller.updateBrand({ primaryColor: '#354FD8' }, user, req);

      expect(mockSettings.set).not.toHaveBeenCalled();
      expect(mockLogHandler.execute).not.toHaveBeenCalled();
    });
  });
});
