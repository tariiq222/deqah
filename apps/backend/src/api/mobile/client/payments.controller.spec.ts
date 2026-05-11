import { MobileClientPaymentsController, MobileListPaymentsQuery } from './payments.controller';
import type { ClientSession } from '../../../common/auth/client-session.decorator';

const USER: ClientSession = { id: 'client-1', email: null, phone: null };

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const listPayments = fn({ data: [], meta: {} });
  const getInvoice = fn({ id: 'inv-1', total: 100 });
  const bankTransferUpload = fn({ id: 'pay-1' });
  const initClientPayment = fn({ paymentId: 'pay-1', redirectUrl: 'https://moyasar.test/p/pay-1' });
  const controller = new MobileClientPaymentsController(
    listPayments as never,
    getInvoice as never,
    bankTransferUpload as never,
    initClientPayment as never,
  );
  return { controller, listPayments, getInvoice, bankTransferUpload, initClientPayment };
}

describe('MobileClientPaymentsController', () => {
  describe('listMyPayments', () => {
    it('passes clientId and pagination defaults', async () => {
      const { controller, listPayments } = buildController();
      await controller.listMyPayments(USER, {});
      expect(listPayments.execute).toHaveBeenCalledWith({
        clientId: USER.id, page: 1, limit: 20,
      });
    });

    it('uses query params for page and limit', async () => {
      const { controller, listPayments } = buildController();
      const q: MobileListPaymentsQuery = { page: 3, limit: 50 };
      await controller.listMyPayments(USER, q);
      expect(listPayments.execute).toHaveBeenCalledWith({
        clientId: USER.id, page: 3, limit: 50,
      });
    });

    it('returns handler result', async () => {
      const { controller } = buildController();
      const result = await controller.listMyPayments(USER, {});
      expect(result).toEqual({ data: [], meta: {} });
    });
  });

  describe('getInvoiceEndpoint', () => {
    it('passes invoiceId to handler', async () => {
      const { controller, getInvoice } = buildController();
      await controller.getInvoiceEndpoint('inv-123', USER);
      expect(getInvoice.execute).toHaveBeenCalledWith({ invoiceId: 'inv-123', clientId: USER.id });
    });

    it('returns handler result', async () => {
      const { controller } = buildController();
      const result = await controller.getInvoiceEndpoint('inv-123', USER);
      expect(result).toEqual({ id: 'inv-1', total: 100 });
    });
  });
});
