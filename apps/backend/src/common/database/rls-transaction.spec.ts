import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { RlsTransactionService, MissingRlsContextError } from './rls-transaction';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TENANT_CLS_KEY } from '../tenant/tenant.constants';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Builds a minimal mock TransactionClient with a spy on $queryRaw.
 */
function makeTxMock(): Prisma.TransactionClient {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  } as unknown as Prisma.TransactionClient;
}

describe('RlsTransactionService', () => {
  let service: RlsTransactionService;
  let txMock: Prisma.TransactionClient;
  let prismaTransactionMock: jest.Mock;
  let clsGetMock: jest.Mock;

  beforeEach(async () => {
    txMock = makeTxMock();
    prismaTransactionMock = jest.fn().mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(txMock));
    clsGetMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RlsTransactionService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: prismaTransactionMock,
          },
        },
        {
          provide: ClsService,
          useValue: {
            get: clsGetMock,
          },
        },
      ],
    }).compile();

    service = module.get<RlsTransactionService>(RlsTransactionService);
  });

  describe('withTransaction — CLS tenant context', () => {
    it('calls set_config with the CLS org id before fn(tx)', async () => {
      clsGetMock.mockImplementation((key: string) => {
        if (key === TENANT_CLS_KEY) return { organizationId: ORG_ID };
        return undefined;
      });

      const fnResult = { ok: true };
      const fn = jest.fn().mockResolvedValue(fnResult);

      const result = await service.withTransaction(fn);

      // $transaction was called
      expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
      // set_config was called on the tx BEFORE fn
      expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
      // When $queryRaw is called as a tagged template on a jest.fn(), calls[0][0] is
      // the TemplateStringsArray (the strings portion), and calls[0][1..n] are the
      // interpolated values. There is no Prisma.Sql wrapper on a plain mock.
      const rawStrings = (txMock.$queryRaw as jest.Mock).mock.calls[0] as unknown[];
      const sqlStrings = rawStrings[0] as string[];
      const sqlValues = rawStrings.slice(1);
      // The tagged-template interpolates orgId as a value
      expect(sqlValues).toContain(ORG_ID);
      expect(sqlStrings.join('')).toContain('set_config');
      // fn was called with the tx and returned its value
      expect(fn).toHaveBeenCalledWith(txMock);
      expect(result).toBe(fnResult);
    });

    it('uses options.organizationId over CLS when both are provided', async () => {
      const overrideOrgId = '22222222-2222-2222-2222-222222222222';
      clsGetMock.mockImplementation((key: string) => {
        if (key === TENANT_CLS_KEY) return { organizationId: ORG_ID };
        return undefined;
      });

      const fn = jest.fn().mockResolvedValue('ok');
      await service.withTransaction(fn, { organizationId: overrideOrgId });

      const rawStrings2 = (txMock.$queryRaw as jest.Mock).mock.calls[0] as unknown[];
      const sqlValues2 = rawStrings2.slice(1);
      expect(sqlValues2).toContain(overrideOrgId);
      expect(sqlValues2).not.toContain(ORG_ID);
    });
  });

  describe('withTransaction — missing org id', () => {
    it('throws MissingRlsContextError when no org id in CLS and bypassRls is false', async () => {
      clsGetMock.mockReturnValue(undefined);

      const fn = jest.fn();
      await expect(service.withTransaction(fn)).rejects.toBeInstanceOf(MissingRlsContextError);
      // fn must NOT have been called
      expect(fn).not.toHaveBeenCalled();
    });

    it('throws MissingRlsContextError when CLS context has no organizationId', async () => {
      clsGetMock.mockImplementation((key: string) => {
        if (key === TENANT_CLS_KEY) return { organizationId: undefined };
        return undefined;
      });

      const fn = jest.fn();
      await expect(service.withTransaction(fn)).rejects.toBeInstanceOf(MissingRlsContextError);
    });
  });

  describe('withTransaction — bypassRls: true', () => {
    it('skips set_config for app.current_org_id and sets app.bypass_rls instead', async () => {
      clsGetMock.mockReturnValue(undefined); // no CLS context

      const fn = jest.fn().mockResolvedValue('bypass-result');
      const result = await service.withTransaction(fn, { bypassRls: true });

      expect(result).toBe('bypass-result');
      expect(fn).toHaveBeenCalledWith(txMock);

      const bypassStrings = (txMock.$queryRaw as jest.Mock).mock.calls[0][0] as string[];
      expect(bypassStrings.join('')).toContain('bypass_rls');
      // Must NOT set app.current_org_id
      expect(bypassStrings.join('')).not.toContain('current_org_id');
    });
  });

  describe('withBypassTransaction', () => {
    it('is equivalent to withTransaction({ bypassRls: true })', async () => {
      clsGetMock.mockReturnValue(undefined);

      const fn = jest.fn().mockResolvedValue('bypass');
      await service.withBypassTransaction(fn);

      const bypassStrings2 = (txMock.$queryRaw as jest.Mock).mock.calls[0][0] as string[];
      expect(bypassStrings2.join('')).toContain('bypass_rls');
      expect(fn).toHaveBeenCalledWith(txMock);
    });
  });

  describe('Prisma transaction options pass-through', () => {
    it('forwards timeout and isolationLevel to prisma.$transaction', async () => {
      clsGetMock.mockImplementation((key: string) => {
        if (key === TENANT_CLS_KEY) return { organizationId: ORG_ID };
        return undefined;
      });

      const fn = jest.fn().mockResolvedValue(null);
      await service.withTransaction(fn, {
        timeout: 5000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      const [, opts] = prismaTransactionMock.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(opts.timeout).toBe(5000);
      expect(opts.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
    });
  });
});
