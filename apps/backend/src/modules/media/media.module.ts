import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatabaseModule } from '../../infrastructure/database';
import { MessagingModule } from '../../infrastructure/messaging.module';
import { UploadFileHandler } from './files/upload-file.handler';
import { GetFileHandler } from './files/get-file.handler';
import { DeleteFileHandler } from './files/delete-file.handler';
import { GeneratePresignedUrlHandler } from './files/generate-presigned-url.handler';
import { MAX_FILE_SIZE_BYTES } from './files/upload-file.handler';
import { DashboardMediaController } from '../../api/dashboard/media.controller';

const handlers = [
  UploadFileHandler,
  GetFileHandler,
  DeleteFileHandler,
  GeneratePresignedUrlHandler,
];

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    MessagingModule,
    MulterModule.register({ storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } }),
  ],
  controllers: [DashboardMediaController],
  providers: [...handlers],
  exports: [...handlers],
})
export class MediaModule {}
