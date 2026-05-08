import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { File, FileVisibility } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { MinioService } from '../../../infrastructure/storage/minio.service';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { FileUploadedEvent } from '../events/file-uploaded.event';
import { UploadFileDto } from './upload-file.dto';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

export type UploadFileCommand = UploadFileDto & {
  filename: string;
  mimetype: string;
  size: number;
  /**
   * Identity of the uploader. MUST be set by the controller from
   * `req.user.sub` (the authenticated JWT) — never accept this from a
   * request body or query parameter.
   */
  uploadedBy?: string;
};

@Injectable()
export class UploadFileHandler {
  private readonly defaultBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    config: ConfigService,
  ) {
    this.defaultBucket = config.getOrThrow<string>('MINIO_BUCKET');
  }

  async execute(cmd: UploadFileCommand, buffer: Buffer): Promise<File & { url: string }> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty file buffer');
    }
    if (buffer.length !== cmd.size) {
      throw new BadRequestException('Declared size does not match buffer length');
    }
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`);
    }
    if (!ALLOWED_MIME_TYPES.has(cmd.mimetype)) {
      throw new BadRequestException(`Mime type not allowed: ${cmd.mimetype}`);
    }

    const ext = extname(cmd.filename).toLowerCase();
    const storageKey = `${randomUUID()}${ext}`;
    const organizationId = this.tenant.requireOrganizationIdOrDefault();

    const url = await this.storage.uploadFile(this.defaultBucket, storageKey, buffer, cmd.mimetype);

    let file: File;
    try {
      file = await this.prisma.file.create({
        data: {
          organizationId,
          bucket: this.defaultBucket,
          storageKey,
          filename: cmd.filename,
          mimetype: cmd.mimetype,
          size: cmd.size,
          visibility: cmd.visibility ?? FileVisibility.PRIVATE,
          ownerType: cmd.ownerType,
          ownerId: cmd.ownerId,
          uploadedBy: cmd.uploadedBy,
        },
      });
    } catch (err) {
      // If DB insert fails, delete the orphan MinIO object.
      await this.storage
        .deleteFile(this.defaultBucket, storageKey)
        .catch(() => undefined);
      throw err;
    }

    const event = new FileUploadedEvent({
      fileId: file.id,
      organizationId,
      sizeBytes: file.size,
    });
    this.eventBus.publish(event.eventName, event.toEnvelope()).catch(() => {});

    return Object.assign(file, { url });
  }
}
