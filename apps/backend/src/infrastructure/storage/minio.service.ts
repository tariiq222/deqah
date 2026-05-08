import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

export interface IStorageService {
  uploadFile(bucket: string, key: string, buffer: Buffer, mimetype: string): Promise<string>;
  deleteFile(bucket: string, key: string): Promise<void>;
  getSignedUrl(bucket: string, key: string, expiry?: number): Promise<string>;
  fileExists(bucket: string, key: string): Promise<boolean>;
}

@Injectable()
export class MinioService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Client;
  private readonly defaultBucket: string;
  private readonly publicEndpoint: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.getOrThrow<string>('MINIO_ENDPOINT');
    const port = this.config.getOrThrow<number>('MINIO_PORT');
    const useSSL = this.config.get<string>('MINIO_USE_SSL') === 'true';

    this.client = new Client({
      endPoint: endpoint,
      port: Number(port),
      useSSL,
      accessKey: this.config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: this.config.getOrThrow<string>('MINIO_SECRET_KEY'),
    });

    this.defaultBucket = this.config.getOrThrow<string>('MINIO_BUCKET');
    const scheme = useSSL ? 'https' : 'http';
    this.publicEndpoint = `${scheme}://${endpoint}:${port}`;
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.defaultBucket);
      if (!exists) {
        await this.client.makeBucket(this.defaultBucket);
        this.logger.log(`Bucket "${this.defaultBucket}" created`);
      }
      this.logger.log('MinIO connected');
    } catch (err) {
      // Dev convenience: allow the server to boot without MinIO for UI-only workflows.
      // File upload endpoints will still fail at call time if MinIO is unreachable.
      this.logger.warn(`MinIO unavailable — file storage disabled: ${(err as Error).message}`);
    }
  }

  async uploadFile(bucket: string, key: string, buffer: Buffer, mimetype: string): Promise<string> {
    await this.client.putObject(bucket, key, buffer, buffer.length, { 'Content-Type': mimetype });
    return `${this.publicEndpoint}/${bucket}/${key}`;
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  async getSignedUrl(bucket: string, key: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(bucket, key, expiry);
  }

  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async bucketExists(bucket: string): Promise<boolean> {
    return this.client.bucketExists(bucket);
  }
}
