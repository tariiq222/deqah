import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database';
import { PlatformSettingsModule } from '../settings/platform-settings.module';
import { GetSystemHealthHandler } from './get-system-health/get-system-health.handler';

@Module({
  imports: [DatabaseModule, PlatformSettingsModule],
  providers: [GetSystemHealthHandler],
  exports: [GetSystemHealthHandler],
})
export class SystemHealthModule {}
