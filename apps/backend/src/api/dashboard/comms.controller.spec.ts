import { DashboardCommsController } from './comms.controller';
import { REQUIRE_FEATURE_KEY } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { CHECK_PERMISSIONS_KEY, RequiredPermission } from '../../common/guards/casl.guard';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const listNotifications = fn({ data: [], meta: {} });
  const getUnreadCount = fn({ count: 0 });
  const markRead = fn({ updated: 1 });
  const listEmailTemplates = fn({ data: [] });
  const getEmailTemplate = fn({ id: 'tpl-1' });
  const createEmailTemplate = fn({ id: 'tpl-1' });
  const updateEmailTemplate = fn({ id: 'tpl-1' });
  const previewEmailTemplate = fn({ subject: 's', html: 'h' });
  const listConversations = fn({ data: [] });
  const listMessages = fn({ data: [] });
  const getConversation = fn({ id: 'cv-1' });
  const closeConversation = fn({ id: 'cv-1' });
  const sendStaffMessage = fn({ id: 'msg-1' });
  const listContactMessages = fn({ data: [] });
  const updateContactMessageStatus = fn({ id: 'cm-1' });
  const getOrgSmsConfig = fn({ provider: 'NONE', credentialsConfigured: false });
  const upsertOrgSmsConfig = fn({ provider: 'NONE', credentialsConfigured: false });
  const testSmsConfig = fn({ ok: true });
  const getOrgEmailConfig = fn({ provider: 'NONE', credentialsConfigured: false });
  const upsertOrgEmailConfig = fn({ provider: 'NONE', credentialsConfigured: false });
  const testEmailConfig = fn({ ok: true });
  const prisma = { smsDelivery: { findMany: jest.fn().mockResolvedValue([]) } };
  const tenant = { requireOrganizationIdOrDefault: jest.fn().mockReturnValue('org-A') };
  const listTenantDeliveryLogs = fn({ data: [], meta: {} });
  const usageCounter = { read: jest.fn().mockResolvedValue(0) };
  const subscriptionCache = { get: jest.fn().mockResolvedValue({ limits: {} }) };
  const controller = new DashboardCommsController(
    listNotifications as never, getUnreadCount as never, markRead as never,
    listEmailTemplates as never, getEmailTemplate as never, createEmailTemplate as never,
    updateEmailTemplate as never, previewEmailTemplate as never,
    listConversations as never, listMessages as never,
    getConversation as never, closeConversation as never, sendStaffMessage as never,
    listContactMessages as never, updateContactMessageStatus as never,
    getOrgSmsConfig as never, upsertOrgSmsConfig as never, testSmsConfig as never,
    getOrgEmailConfig as never, upsertOrgEmailConfig as never, testEmailConfig as never,
    prisma as never, tenant as never,
    listTenantDeliveryLogs as never, usageCounter as never, subscriptionCache as never,
  );
  return {
    controller, listNotifications, getUnreadCount, markRead,
    listEmailTemplates, getEmailTemplate, createEmailTemplate, updateEmailTemplate, previewEmailTemplate,
    listConversations, listMessages, getConversation, closeConversation, sendStaffMessage,
    listContactMessages, updateContactMessageStatus,
  };
}

describe('DashboardCommsController', () => {
  it('listNotificationsEndpoint — passes recipientId with defaults', async () => {
    const { controller, listNotifications } = buildController();
    await controller.listNotificationsEndpoint({ sub: 'user-1' } as never, {} as never);
    expect(listNotifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'user-1', page: 1, limit: 20 }),
    );
  });

  it('markReadEndpoint — passes recipientId', async () => {
    const { controller, markRead } = buildController();
    await controller.markReadEndpoint({ sub: 'user-1' } as never, { ids: ['n-1'] } as never);
    expect(markRead.execute).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'user-1' }));
  });

  it('listEmailTemplatesEndpoint — passes page and limit', async () => {
    const { controller, listEmailTemplates } = buildController();
    await controller.listEmailTemplatesEndpoint({} as never);
    expect(listEmailTemplates.execute).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('getEmailTemplateEndpoint — passes id', async () => {
    const { controller, getEmailTemplate } = buildController();
    await controller.getEmailTemplateEndpoint('tpl-1');
    expect(getEmailTemplate.execute).toHaveBeenCalledWith({ id: 'tpl-1' });
  });

  it('createEmailTemplateEndpoint — delegates to handler', async () => {
    const { controller, createEmailTemplate } = buildController();
    await controller.createEmailTemplateEndpoint({ type: 'BOOKING_CONFIRMED' } as never);
    expect(createEmailTemplate.execute).toHaveBeenCalled();
  });

  it('updateEmailTemplateEndpoint — passes id', async () => {
    const { controller, updateEmailTemplate } = buildController();
    await controller.updateEmailTemplateEndpoint('tpl-1', { subject: 'Updated' } as never);
    expect(updateEmailTemplate.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tpl-1' }),
    );
  });

  it('listConversationsEndpoint — passes defaults', async () => {
    const { controller, listConversations } = buildController();
    await controller.listConversationsEndpoint({} as never);
    expect(listConversations.execute).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('listMessagesEndpoint — passes conversationId', async () => {
    const { controller, listMessages } = buildController();
    await controller.listMessagesEndpoint('conv-1', {} as never);
    expect(listMessages.execute).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1' }),
    );
  });
});

describe('@RequireFeature metadata — EMAIL_TEMPLATES', () => {
  it.each([
    'listEmailTemplatesEndpoint',
    'createEmailTemplateEndpoint',
    'getEmailTemplateEndpoint',
    'previewEmailTemplateEndpoint',
    'updateEmailTemplateEndpoint',
  ])('annotates %s with FeatureKey.EMAIL_TEMPLATES', (method) => {
    const meta = Reflect.getMetadata(
      REQUIRE_FEATURE_KEY,
      (DashboardCommsController.prototype as unknown as Record<string, unknown>)[method] as object,
    );
    expect(meta).toBe(FeatureKey.EMAIL_TEMPLATES);
  });
});

describe('@RequireFeature metadata — SMS_PROVIDER_PER_TENANT', () => {
  it.each([
    'getSmsConfigEndpoint',
    'upsertSmsConfigEndpoint',
    'testSmsConfigEndpoint',
  ])('annotates %s with FeatureKey.SMS_PROVIDER_PER_TENANT', (method) => {
    const meta = Reflect.getMetadata(
      REQUIRE_FEATURE_KEY,
      (DashboardCommsController.prototype as unknown as Record<string, unknown>)[method] as object,
    );
    expect(meta).toBe(FeatureKey.SMS_PROVIDER_PER_TENANT);
  });
});

// ── CASL permission decorator coverage (TAR-47) ────────────────────────────
// Every dashboard route in this controller must carry an explicit
// @CheckPermissions decorator. Missing decorators previously fail-opened
// (parent: TAR-41 / TAR-47).

describe('@CheckPermissions decorator coverage (TAR-47)', () => {
  const PROTOTYPE = DashboardCommsController.prototype as unknown as Record<string, unknown>;
  const expected: Array<{ method: string; permission: RequiredPermission }> = [
    { method: 'getSmsConfigEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'upsertSmsConfigEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'testSmsConfigEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'getEmailConfigEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'upsertEmailConfigEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'testEmailConfigEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'listSmsDeliveriesEndpoint', permission: { action: 'read', subject: 'Setting' } },
    { method: 'listContactMessagesEndpoint', permission: { action: 'read', subject: 'Setting' } },
    { method: 'updateContactMessageStatusEndpoint', permission: { action: 'update', subject: 'Setting' } },
    { method: 'listNotificationsEndpoint', permission: { action: 'read', subject: 'Booking' } },
    { method: 'getUnreadCountEndpoint', permission: { action: 'read', subject: 'Booking' } },
    { method: 'markReadEndpoint', permission: { action: 'update', subject: 'Booking' } },
    { method: 'listEmailTemplatesEndpoint', permission: { action: 'read', subject: 'Setting' } },
    { method: 'createEmailTemplateEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'getEmailTemplateEndpoint', permission: { action: 'read', subject: 'Setting' } },
    { method: 'previewEmailTemplateEndpoint', permission: { action: 'read', subject: 'Setting' } },
    { method: 'updateEmailTemplateEndpoint', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'listConversationsEndpoint', permission: { action: 'read', subject: 'Booking' } },
    { method: 'listMessagesEndpoint', permission: { action: 'read', subject: 'Booking' } },
    { method: 'getConversationEndpoint', permission: { action: 'read', subject: 'Booking' } },
    { method: 'closeConversationEndpoint', permission: { action: 'update', subject: 'Booking' } },
    { method: 'sendStaffMessageEndpoint', permission: { action: 'update', subject: 'Booking' } },
    { method: 'listDeliveryLogs', permission: { action: 'read', subject: 'Setting' } },
    { method: 'getEmailFallbackQuota', permission: { action: 'read', subject: 'Billing' } },
  ];

  it.each(expected)(
    '$method declares CheckPermissions($permission.action, $permission.subject)',
    ({ method, permission }) => {
      const meta = Reflect.getMetadata(
        CHECK_PERMISSIONS_KEY,
        PROTOTYPE[method] as object,
      ) as RequiredPermission[] | undefined;
      expect(meta).toBeDefined();
      expect(meta).toEqual(expect.arrayContaining([expect.objectContaining(permission)]));
    },
  );
});
