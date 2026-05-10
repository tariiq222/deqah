import { BillingController } from './billing.controller';

const buildHandler = <T>(value: T) => ({
  execute: jest.fn().mockResolvedValue(value),
});

describe('BillingController saved-card routes', () => {
  it('delegates saved-card routes to handlers', async () => {
    const listSavedCards = buildHandler([{ id: 'card-1' }]);
    const addSavedCard = buildHandler({ id: 'card-2' });
    const setDefaultSavedCard = buildHandler({ id: 'card-2', isDefault: true });
    const removeSavedCard = buildHandler({ ok: true });
    const controller = new BillingController(
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      listSavedCards as never,
      addSavedCard as never,
      setDefaultSavedCard as never,
      removeSavedCard as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      { requireOrganizationId: jest.fn().mockReturnValue('org-test') } as never,
    );

    await expect(controller.savedCards()).resolves.toEqual([{ id: 'card-1' }]);
    expect(listSavedCards.execute).toHaveBeenCalled();

    const dto = {
      moyasarTokenId: 'token_abc',
      makeDefault: true,
      idempotencyKey: '1f210deb-3501-4c46-8fd5-2f89f318a39b',
    };
    await controller.addCard(dto);
    expect(addSavedCard.execute).toHaveBeenCalledWith(dto);

    await controller.setDefaultCard('card-2');
    expect(setDefaultSavedCard.execute).toHaveBeenCalledWith('card-2');

    await controller.removeCard('card-2');
    expect(removeSavedCard.execute).toHaveBeenCalledWith('card-2');
  });
});

describe('BillingController cancellation routes', () => {
  it('delegates schedule-cancel and reactivate routes to handlers', async () => {
    const cancel = buildHandler({ id: 'sub-1', cancelAtPeriodEnd: true });
    const reactivate = buildHandler({ id: 'sub-1', cancelAtPeriodEnd: false });
    const controller = new BillingController(
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      cancel as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      reactivate as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      { requireOrganizationId: jest.fn().mockReturnValue('org-test') } as never,
    );

    await controller.scheduleCancelSub({ reason: 'budget' });
    expect(cancel.execute).toHaveBeenCalledWith({ reason: 'budget' });

    await controller.reactivateSub();
    expect(reactivate.execute).toHaveBeenCalledWith();
  });
});

describe('BillingController proration routes', () => {
  it('delegates proration preview to the handler', async () => {
    const proration = buildHandler({ action: 'UPGRADE_NOW', amountHalalas: 30000 });
    const controller = new BillingController(
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      proration as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      { requireOrganizationId: jest.fn().mockReturnValue('org-test') } as never,
    );

    await expect(
      controller.prorationPreview({ planId: 'plan-pro', billingCycle: 'MONTHLY' }),
    ).resolves.toEqual({ action: 'UPGRADE_NOW', amountHalalas: 30000 });
    expect(proration.execute).toHaveBeenCalledWith({
      planId: 'plan-pro',
      billingCycle: 'MONTHLY',
    });
  });
});

describe('BillingController scheduled downgrade routes', () => {
  it('delegates new and legacy downgrade routes to schedule downgrade handler', async () => {
    const scheduleDowngrade = buildHandler({ scheduledPlanId: 'plan-basic' });
    const cancelScheduledDowngrade = buildHandler({ scheduledPlanId: null });
    const controller = new BillingController(
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      scheduleDowngrade as never,
      cancelScheduledDowngrade as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      { requireOrganizationId: jest.fn().mockReturnValue('org-test') } as never,
    );
    const dto = { planId: 'plan-basic', billingCycle: 'MONTHLY' as const };

    await controller.scheduleDowngradePlan(dto);
    await controller.downgradePlan(dto);
    await controller.cancelScheduledDowngradePlan();

    expect(scheduleDowngrade.execute).toHaveBeenCalledTimes(2);
    expect(scheduleDowngrade.execute).toHaveBeenCalledWith(dto);
    expect(cancelScheduledDowngrade.execute).toHaveBeenCalledWith();
  });
});

describe('BillingController dunning routes', () => {
  it('delegates manual payment retry to the handler', async () => {
    const retryFailedPayment = buildHandler({ ok: true, status: 'PAID' });
    const controller = new BillingController(
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      retryFailedPayment as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      { requireOrganizationId: jest.fn().mockReturnValue('org-test') } as never,
    );

    await expect(controller.retryPayment()).resolves.toEqual({ ok: true, status: 'PAID' });

    expect(retryFailedPayment.execute).toHaveBeenCalledWith();
  });
});

describe('BillingController invoice routes', () => {
  it('delegates list/get invoice routes to handlers', async () => {
    const listInvoices = buildHandler({ items: [], nextCursor: null });
    const getInvoice = buildHandler({ id: 'inv-1' });
    const controller = new BillingController(
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler([]) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      buildHandler(null) as never,
      listInvoices as never,
      getInvoice as never,
      buildHandler(null) as never,
      { requireOrganizationId: jest.fn().mockReturnValue('org-test') } as never,
      buildHandler(null) as never,
    );

    await expect(controller.listInvoices({ limit: 10 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(listInvoices.execute).toHaveBeenCalledWith({ limit: 10 });

    await controller.getInvoice('inv-1');
    expect(getInvoice.execute).toHaveBeenCalledWith('inv-1');
  });
});
