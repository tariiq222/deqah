import { AdminBillingController } from './billing.controller';
import { Request } from 'express';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const listSubs = fn();
  const getOrgBilling = fn();
  const listInvoices = fn();
  const listZohoSaasInvoices = fn();
  const getMetrics = fn();
  const waiveInvoice = fn();
  const grantCredit = fn();
  const changePlanForOrg = fn();
  const refundInvoice = fn();
  const forceCharge = fn();
  const cancelScheduled = fn();
  const controller = new AdminBillingController(
    listSubs as never,
    getOrgBilling as never,
    listInvoices as never,
    listZohoSaasInvoices as never,
    getMetrics as never,
    waiveInvoice as never,
    grantCredit as never,
    changePlanForOrg as never,
    refundInvoice as never,
    forceCharge as never,
    cancelScheduled as never,
  );
  return {
    controller, listSubs, getOrgBilling, listInvoices, listZohoSaasInvoices, getMetrics,
    waiveInvoice, grantCredit, changePlanForOrg, refundInvoice,
    forceCharge, cancelScheduled,
  };
}

describe('AdminBillingController', () => {
  const user = { id: 'admin-1' };
  const req = { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as unknown as Request;

  it('list — defaults page and perPage', async () => {
    const { controller, listSubs } = buildController();
    await controller.list({});
    expect(listSubs.execute).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      status: undefined,
      planId: undefined,
    });
  });

  it('getOrg — passes orgId', async () => {
    const { controller, getOrgBilling } = buildController();
    await controller.getOrg('org-1');
    expect(getOrgBilling.execute).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('invoices — defaults page, perPage and includeDrafts', async () => {
    const { controller, listInvoices } = buildController();
    await controller.invoices({});
    expect(listInvoices.execute).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      status: undefined,
      organizationId: undefined,
      fromDate: undefined,
      toDate: undefined,
      includeDrafts: false,
    });
  });

  it('metrics — calls handler', async () => {
    const { controller, getMetrics } = buildController();
    await controller.metrics();
    expect(getMetrics.execute).toHaveBeenCalled();
  });

  it('waive — passes context and reason', async () => {
    const { controller, waiveInvoice } = buildController();
    await controller.waive('inv-1', { reason: 'mistake' }, user, req);
    expect(waiveInvoice.execute).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      superAdminUserId: user.id,
      reason: 'mistake',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('grant — defaults currency to SAR', async () => {
    const { controller, grantCredit } = buildController();
    await controller.grant({ organizationId: 'org-1', amount: 100, reason: 'promo' }, user, req);
    expect(grantCredit.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      amount: 100,
      currency: 'SAR',
      reason: 'promo',
      superAdminUserId: user.id,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('refund — passes params correctly', async () => {
    const { controller, refundInvoice } = buildController();
    await controller.refund('inv-1', { amount: 50, reason: 'dissatisfied' }, user, req);
    expect(refundInvoice.execute).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      amount: 50,
      superAdminUserId: user.id,
      reason: 'dissatisfied',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('changePlan — passes params correctly', async () => {
    const { controller, changePlanForOrg } = buildController();
    await controller.changePlan('org-1', { newPlanId: 'plan-2', reason: 'upsell' }, user, req);
    expect(changePlanForOrg.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      newPlanId: 'plan-2',
      superAdminUserId: user.id,
      reason: 'upsell',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('forceCharge — passes orgId and admin context', async () => {
    const { controller, forceCharge } = buildController();
    await controller.forceChargeOrg('org-1', user, req);
    expect(forceCharge.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      superAdminUserId: user.id,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('cancelScheduled — passes orgId and admin context', async () => {
    const { controller, cancelScheduled } = buildController();
    await controller.cancelScheduledCancellation('org-1', user, req);
    expect(cancelScheduled.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      superAdminUserId: user.id,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });
});
