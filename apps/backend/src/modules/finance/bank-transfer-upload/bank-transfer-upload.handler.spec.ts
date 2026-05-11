import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { BankTransferUploadHandler } from './bank-transfer-upload.handler';

// ── Magic-byte fixtures ──────────────────────────────────────────────────────

/** Valid JPEG: SOI + JFIF APP0 marker */
const JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

/** Valid PNG: signature bytes */
const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png-body'),
]);

/** Valid PDF: %PDF- magic */
const PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj\nstartxref\n0\n%%EOF\n');

/** MP4 ftyp box — spoofing attempts */
const MP4_BUFFER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
]);

const mockInvoice = {
  id: 'inv-1',
  total: new (require('decimal.js')).Decimal(230),
  currency: 'SAR',
  clientId: 'client-1',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

const mockPayment = {
  id: 'pay-1',
  method: PaymentMethod.BANK_TRANSFER,
  status: PaymentStatus.PENDING_VERIFICATION,
  receiptUrl: 'http://minio/bucket/path.jpg',
};

const buildPrisma = (invoiceOverrides = {}) => ({
  invoice: {
    findFirst: jest.fn().mockResolvedValue({ ...mockInvoice, ...invoiceOverrides }),
  },
  payment: { create: jest.fn().mockResolvedValue(mockPayment) },
});

const buildStorage = () => ({
  uploadFile: jest.fn().mockResolvedValue('http://minio/bucket/path.jpg'),
});

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
});

const baseCmd = {
  invoiceId: 'inv-1',
  clientId: 'client-1',
  amount: 230,
};

describe('BankTransferUploadHandler', () => {
  describe('valid uploads', () => {
    it('uploads JPEG receipt and creates PENDING_VERIFICATION payment', async () => {
      const prisma = buildPrisma();
      const storage = buildStorage();
      const handler = new BankTransferUploadHandler(prisma as never, buildTenant() as never, storage as never);

      const result = await handler.execute({
        ...baseCmd,
        fileBuffer: JPEG_BUFFER,
        mimetype: 'image/jpeg',
        filename: 'receipt.jpg',
      });

      expect(storage.uploadFile).toHaveBeenCalledWith(
        'finance-receipts',
        expect.stringContaining('inv-1/'),
        JPEG_BUFFER,
        'image/jpeg',
      );
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PENDING_VERIFICATION,
            method: PaymentMethod.BANK_TRANSFER,
            receiptUrl: 'http://minio/bucket/path.jpg',
          }),
        }),
      );
      expect(result.id).toBe('pay-1');
    });

    it('uploads PNG receipt', async () => {
      const storage = buildStorage();
      const handler = new BankTransferUploadHandler(buildPrisma() as never, buildTenant() as never, storage as never);

      await handler.execute({
        ...baseCmd,
        fileBuffer: PNG_BUFFER,
        mimetype: 'image/png',
        filename: 'receipt.png',
      });

      expect(storage.uploadFile).toHaveBeenCalledWith(
        'finance-receipts',
        expect.stringContaining('inv-1/'),
        PNG_BUFFER,
        'image/png',
      );
    });

    it('uploads PDF receipt', async () => {
      const storage = buildStorage();
      const handler = new BankTransferUploadHandler(buildPrisma() as never, buildTenant() as never, storage as never);

      await handler.execute({
        ...baseCmd,
        fileBuffer: PDF_BUFFER,
        mimetype: 'application/pdf',
        filename: 'receipt.pdf',
      });

      expect(storage.uploadFile).toHaveBeenCalledWith(
        'finance-receipts',
        expect.stringContaining('inv-1/'),
        PDF_BUFFER,
        'application/pdf',
      );
    });
  });

  describe('magic-byte rejection', () => {
    it('rejects MP4 bytes claimed as image/jpeg', async () => {
      const storage = buildStorage();
      const handler = new BankTransferUploadHandler(buildPrisma() as never, buildTenant() as never, storage as never);

      await expect(
        handler.execute({
          ...baseCmd,
          fileBuffer: MP4_BUFFER,
          mimetype: 'image/jpeg',
          filename: 'evil.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects PNG bytes claimed as application/pdf', async () => {
      const storage = buildStorage();
      const handler = new BankTransferUploadHandler(buildPrisma() as never, buildTenant() as never, storage as never);

      await expect(
        handler.execute({
          ...baseCmd,
          fileBuffer: PNG_BUFFER,
          mimetype: 'application/pdf',
          filename: 'spoof.pdf',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe('ownership and amount validation', () => {
    it('throws ForbiddenException when invoice belongs to another client', async () => {
      const prisma = buildPrisma({ clientId: 'client-other' });
      const handler = new BankTransferUploadHandler(prisma as never, buildTenant() as never, buildStorage() as never);

      await expect(
        handler.execute({
          ...baseCmd,
          fileBuffer: JPEG_BUFFER,
          mimetype: 'image/jpeg',
          filename: 'receipt.jpg',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('accepts transfer amount within tolerance of invoice total (e.g. partial payment rounding)', async () => {
      const prisma = buildPrisma();
      const storage = buildStorage();
      const handler = new BankTransferUploadHandler(prisma as never, buildTenant() as never, storage as never);

      await expect(
        handler.execute({
          ...baseCmd,
          amount: 229.99,
          fileBuffer: JPEG_BUFFER,
          mimetype: 'image/jpeg',
          filename: 'receipt.jpg',
        }),
      ).resolves.toHaveProperty('id', 'pay-1');
    });

    it('throws BadRequestException when transfer amount does not match invoice total', async () => {
      const prisma = buildPrisma();
      const handler = new BankTransferUploadHandler(prisma as never, buildTenant() as never, buildStorage() as never);

      await expect(
        handler.execute({
          ...baseCmd,
          amount: 99,
          fileBuffer: JPEG_BUFFER,
          mimetype: 'image/jpeg',
          filename: 'receipt.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for disallowed mime type', async () => {
      const handler = new BankTransferUploadHandler(buildPrisma() as never, buildTenant() as never, buildStorage() as never);
      await expect(
        handler.execute({ ...baseCmd, fileBuffer: JPEG_BUFFER, mimetype: 'text/html', filename: 'x.html' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when invoice not found', async () => {
      const prisma = buildPrisma();
      prisma.invoice.findFirst = jest.fn().mockResolvedValue(null);
      const handler = new BankTransferUploadHandler(prisma as never, buildTenant() as never, buildStorage() as never);
      await expect(
        handler.execute({ ...baseCmd, fileBuffer: JPEG_BUFFER, mimetype: 'image/jpeg', filename: 'receipt.jpg' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
