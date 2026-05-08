import { BadRequestException } from '@nestjs/common';
import { DashboardMediaController } from './media.controller';

const FILE_ID = '123e4567-e89b-12d3-a456-426614174000';
const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const uploadFile = fn({ id: 'file-1', url: 'https://storage.example.com/file.jpg' });
  const getFile = fn({ id: FILE_ID, url: 'https://storage.example.com/file.jpg' });
  const deleteFile = fn({ success: true });
  const generatePresignedUrl = fn({ url: 'https://storage.example.com/presigned' });
  const controller = new DashboardMediaController(
    uploadFile as never, getFile as never, deleteFile as never, generatePresignedUrl as never,
  );
  return { controller, uploadFile, getFile, deleteFile, generatePresignedUrl };
}

const TEST_USER = { sub: 'user-uuid-123', roles: [], permissions: [] } as never;

describe('DashboardMediaController', () => {
  it('uploadFileEndpoint — throws BadRequestException when no file', () => {
    const { controller } = buildController();
    expect(() => controller.uploadFileEndpoint(undefined, {} as never, TEST_USER)).toThrow(BadRequestException);
  });

  it('uploadFileEndpoint — passes file metadata to handler', async () => {
    const { controller, uploadFile } = buildController();
    const mockFile = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('fake'),
    } as Express.Multer.File;
    await controller.uploadFileEndpoint(mockFile, { folder: 'profile-photos' } as never, TEST_USER);
    expect(uploadFile.execute).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'photo.jpg', mimetype: 'image/jpeg', size: 1024, uploadedBy: 'user-uuid-123' }),
      mockFile.buffer,
    );
  });

  it('uploadFileEndpoint — caller-supplied uploadedBy in body is overridden by JWT', async () => {
    const { controller, uploadFile } = buildController();
    const mockFile = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('fake'),
    } as Express.Multer.File;
    // Even if a caller crafts a body containing uploadedBy, the controller must
    // ignore it and use the JWT identity. UploadFileDto no longer declares
    // uploadedBy — spread order ensures the JWT-derived value wins.
    await controller.uploadFileEndpoint(
      mockFile,
      { uploadedBy: 'attacker-uuid' } as never,
      TEST_USER,
    );
    expect(uploadFile.execute).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedBy: 'user-uuid-123' }),
      mockFile.buffer,
    );
  });

  it('getFileEndpoint — passes fileId', async () => {
    const { controller, getFile } = buildController();
    await controller.getFileEndpoint(FILE_ID);
    expect(getFile.execute).toHaveBeenCalledWith(FILE_ID);
  });

  it('deleteFileEndpoint — passes fileId', async () => {
    const { controller, deleteFile } = buildController();
    await controller.deleteFileEndpoint(FILE_ID);
    expect(deleteFile.execute).toHaveBeenCalledWith(FILE_ID);
  });

  it('presignedUrlEndpoint — passes fileId and query params', async () => {
    const { controller, generatePresignedUrl } = buildController();
    await controller.presignedUrlEndpoint(FILE_ID, { expiresIn: 3600 } as never);
    expect(generatePresignedUrl.execute).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: FILE_ID, expiresIn: 3600 }),
    );
  });
});
