import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { UploadFileHandler } from './upload-file.handler';
import { GetFileHandler } from './get-file.handler';
import { DeleteFileHandler } from './delete-file.handler';
import { GeneratePresignedUrlHandler } from './generate-presigned-url.handler';
import { PrismaService } from '../../../infrastructure/database';
import { MinioService } from '../../../infrastructure/storage/minio.service';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { SubscriptionCacheService } from '../../platform/billing/subscription-cache.service';

const mockFile = {
  id: 'f1',
  bucket: 'deqah',
  storageKey: 'abc.png',
  filename: 'photo.png',
  mimetype: 'image/png',
  size: 12,
  visibility: FileVisibility.PRIVATE,
  ownerType: null,
  ownerId: null,
  uploadedBy: null,
  isDeleted: false,
  organizationId: 'org-A',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Magic-byte fixtures ──────────────────────────────────────────────────────

/** Valid PNG: signature bytes (8) + minimal body */
const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);

/** Valid JPEG: SOI + JFIF APP0 marker */
const JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

/** Valid PDF: %PDF- magic */
const PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj\nstartxref\n0\n%%EOF\n');

/** MP4 ftyp box — spoofing attempts */
const MP4_BUFFER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
]);

describe('Media files handlers', () => {
  let uploadHandler: UploadFileHandler;
  let getHandler: GetFileHandler;
  let deleteHandler: DeleteFileHandler;
  let presignHandler: GeneratePresignedUrlHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storage: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UploadFileHandler,
        GetFileHandler,
        DeleteFileHandler,
        GeneratePresignedUrlHandler,
        {
          provide: PrismaService,
          useValue: (() => {
            const file = {
              create: jest.fn().mockResolvedValue(mockFile),
              findFirst: jest.fn().mockResolvedValue(mockFile),
              update: jest.fn().mockResolvedValue({ ...mockFile, isDeleted: true }),
              aggregate: jest.fn().mockResolvedValue({ _sum: { size: 0 } }),
            };
            return {
              file,
              $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ file })),
            };
          })(),
        },
        {
          provide: MinioService,
          useValue: {
            uploadFile: jest.fn().mockResolvedValue('http://minio/deqah/key'),
            deleteFile: jest.fn().mockResolvedValue(undefined),
            getSignedUrl: jest.fn().mockResolvedValue('http://minio/signed?token=xyz'),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('deqah') },
        },
        {
          provide: TenantContextService,
          useValue: { requireOrganizationIdOrDefault: jest.fn().mockReturnValue('org-A'), requireOrganizationId: jest.fn().mockReturnValue('org-A') },
        },
        {
          provide: EventBusService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: SubscriptionCacheService,
          useValue: { get: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    uploadHandler = module.get(UploadFileHandler);
    getHandler = module.get(GetFileHandler);
    deleteHandler = module.get(DeleteFileHandler);
    presignHandler = module.get(GeneratePresignedUrlHandler);
    prisma = module.get(PrismaService);
    storage = module.get(MinioService);
  });

  describe('upload-file', () => {
    it('uploads PNG buffer and persists metadata', async () => {
      const result = await uploadHandler.execute(
        {
          filename: 'photo.png',
          mimetype: 'image/png',
          size: PNG_BUFFER.length,
        },
        PNG_BUFFER,
      );
      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
      expect(prisma.file.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.file.create.mock.calls[0][0].data;
      expect(createArg.bucket).toBe('deqah');
      expect(createArg.storageKey).toMatch(/^[^/]+\/[0-9a-f-]+\.png$/);
      expect(result).toEqual(mockFile);
    });

    it('uploads JPEG buffer claimed as image/jpeg', async () => {
      prisma.file.create.mockResolvedValueOnce({ ...mockFile, mimetype: 'image/jpeg' });
      const result = await uploadHandler.execute(
        { filename: 'photo.jpg', mimetype: 'image/jpeg', size: JPEG_BUFFER.length },
        JPEG_BUFFER,
      );
      expect(result.mimetype).toBe('image/jpeg');
    });

    it('uploads PDF buffer claimed as application/pdf', async () => {
      prisma.file.create.mockResolvedValueOnce({ ...mockFile, mimetype: 'application/pdf' });
      const result = await uploadHandler.execute(
        { filename: 'doc.pdf', mimetype: 'application/pdf', size: PDF_BUFFER.length },
        PDF_BUFFER,
      );
      expect(result.mimetype).toBe('application/pdf');
    });

    it('accepts text/plain buffer (no magic bytes) claimed as text/plain', async () => {
      const txtBuf = Buffer.from('Plain text content');
      prisma.file.create.mockResolvedValueOnce({ ...mockFile, mimetype: 'text/plain' });
      await expect(
        uploadHandler.execute(
          { filename: 'readme.txt', mimetype: 'text/plain', size: txtBuf.length },
          txtBuf,
        ),
      ).resolves.toBeDefined();
    });

    it('accepts text/csv buffer claimed as text/csv', async () => {
      const csvBuf = Buffer.from('col1,col2\nval1,val2\n');
      prisma.file.create.mockResolvedValueOnce({ ...mockFile, mimetype: 'text/csv' });
      await expect(
        uploadHandler.execute(
          { filename: 'data.csv', mimetype: 'text/csv', size: csvBuf.length },
          csvBuf,
        ),
      ).resolves.toBeDefined();
    });

    it('rejects MP4 bytes claimed as image/png (magic-byte mismatch)', async () => {
      await expect(
        uploadHandler.execute(
          { filename: 'evil.png', mimetype: 'image/png', size: MP4_BUFFER.length },
          MP4_BUFFER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects PNG bytes claimed as application/pdf', async () => {
      await expect(
        uploadHandler.execute(
          { filename: 'spoof.pdf', mimetype: 'application/pdf', size: PNG_BUFFER.length },
          PNG_BUFFER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects empty buffer', async () => {
      await expect(
        uploadHandler.execute(
          { filename: 'a.txt', mimetype: 'text/plain', size: 0 },
          Buffer.alloc(0),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects size mismatch', async () => {
      await expect(
        uploadHandler.execute(
          { filename: 'a.txt', mimetype: 'text/plain', size: 99 },
          Buffer.from('hi'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects files over the size limit', async () => {
      const big = Buffer.alloc(26 * 1024 * 1024, 0);
      await expect(
        uploadHandler.execute(
          { filename: 'big.pdf', mimetype: 'application/pdf', size: big.length },
          big,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects disallowed mime types', async () => {
      const buffer = Buffer.from('MZ');
      await expect(
        uploadHandler.execute(
          { filename: 'evil.exe', mimetype: 'application/x-msdownload', size: buffer.length },
          buffer,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('get-file', () => {
    it('returns file by id', async () => {
      const result = await getHandler.execute('f1');
      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'f1', isDeleted: false, organizationId: 'org-A' },
      });
      expect(result).toEqual(mockFile);
    });

    it('throws NotFound when missing', async () => {
      prisma.file.findFirst.mockResolvedValueOnce(null);
      await expect(getHandler.execute('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete-file', () => {
    it('removes object from storage and soft-deletes row', async () => {
      const result = await deleteHandler.execute('f1');
      expect(storage.deleteFile).toHaveBeenCalledWith('deqah', 'abc.png');
      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { isDeleted: true },
      });
      expect(result.isDeleted).toBe(true);
    });

    it('throws NotFound when file missing', async () => {
      prisma.file.findFirst.mockResolvedValueOnce(null);
      await expect(deleteHandler.execute('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('generate-presigned-url', () => {
    it('returns signed url with default expiry', async () => {
      const result = await presignHandler.execute({ fileId: 'f1' });
      expect(storage.getSignedUrl).toHaveBeenCalledWith('deqah', 'abc.png', 3600);
      expect(result.url).toBe('http://minio/signed?token=xyz');
      expect(result.expiresInSeconds).toBe(3600);
    });

    it('honors custom expiry', async () => {
      await presignHandler.execute({ fileId: 'f1', expirySeconds: 600 });
      expect(storage.getSignedUrl).toHaveBeenCalledWith('deqah', 'abc.png', 600);
    });

    it('throws NotFound when file missing', async () => {
      prisma.file.findFirst.mockResolvedValueOnce(null);
      await expect(
        presignHandler.execute({ fileId: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
