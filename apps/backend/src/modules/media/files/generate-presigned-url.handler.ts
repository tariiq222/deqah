import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { MinioService } from '../../../infrastructure/storage/minio.service';
import { TenantContextService } from '../../../common/tenant';
import { GeneratePresignedUrlDto } from './generate-presigned-url.dto';

const DEFAULT_EXPIRY_SECONDS = 3600;

export type GeneratePresignedUrlQuery = GeneratePresignedUrlDto & {
  fileId: string;
};

@Injectable()
export class GeneratePresignedUrlHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(query: GeneratePresignedUrlQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const file = await this.prisma.file.findFirst({
      where: { id: query.fileId, isDeleted: false, organizationId },
    });
    if (!file) throw new NotFoundException('File not found');

    const expiry = query.expirySeconds ?? DEFAULT_EXPIRY_SECONDS;
    const url = await this.storage.getSignedUrl(file.bucket, file.storageKey, expiry);

    return {
      fileId: file.id,
      url,
      expiresInSeconds: expiry,
      filename: file.filename,
      mimetype: file.mimetype,
    };
  }
}
