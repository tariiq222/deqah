import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatabaseModule } from '../../infrastructure/database';
import { MediaModule } from '../media/media.module';
import { TenantModule } from '../../common/tenant';
import { MessagingModule } from '../../infrastructure/messaging.module';
import { DashboardOrganizationSettingsController } from '../../api/dashboard/organization-settings.controller';
import { UploadLogoHandler } from './branding/upload-logo/upload-logo.handler';
import { CreateServiceHandler } from './services/create-service.handler';
import { UpdateServiceHandler } from './services/update-service.handler';
import { ListServicesHandler } from './services/list-services.handler';
import { GetServiceHandler } from './services/get-service.handler';
import { ArchiveServiceHandler } from './services/archive-service.handler';
import { PriceResolverService } from './services/price-resolver.service';
import { SetDurationOptionsHandler } from './services/set-duration-options.handler';
import { SetEmployeeServiceOptionsHandler } from './services/set-employee-service-options.handler';
import { SetServiceBookingConfigsHandler } from './services/set-service-booking-configs.handler';
import { GetServiceBookingConfigsHandler } from './services/get-service-booking-configs.handler';
import { ListServiceEmployeesHandler } from './services/list-service-employees.handler';
import { UpsertBrandingHandler } from './branding/upsert-branding.handler';
import { GetBrandingHandler } from './branding/get-branding.handler';
import { GetPublicBrandingHandler } from './branding/public/get-public-branding.handler';
import { CreateIntakeFormHandler } from './intake-forms/create-intake-form.handler';
import { GetIntakeFormHandler } from './intake-forms/get-intake-form.handler';
import { ListIntakeFormsHandler } from './intake-forms/list-intake-forms.handler';
import { DeleteIntakeFormHandler } from './intake-forms/delete-intake-form.handler';
import { SubmitRatingHandler } from './ratings/submit-rating.handler';
import { ListRatingsHandler } from './ratings/list-ratings.handler';
import { GetOrgSettingsHandler } from './org-settings/get-org-settings.handler';
import { UpsertOrgSettingsHandler } from './org-settings/upsert-org-settings.handler';
import { GetBookingSettingsHandler } from '../bookings/get-booking-settings/get-booking-settings.handler';
import { UpsertBookingSettingsHandler } from '../bookings/upsert-booking-settings/upsert-booking-settings.handler';
import { MAX_FILE_SIZE_BYTES } from '../media/files/upload-file.handler';
import { VerticalsModule } from '../platform/verticals/verticals.module';

const serviceHandlers = [
  CreateServiceHandler, UpdateServiceHandler, ListServicesHandler, GetServiceHandler, ArchiveServiceHandler,
  PriceResolverService, SetDurationOptionsHandler, SetEmployeeServiceOptionsHandler,
  SetServiceBookingConfigsHandler, GetServiceBookingConfigsHandler,
  ListServiceEmployeesHandler,
];

@Module({
  imports: [DatabaseModule, MediaModule, TenantModule, VerticalsModule, MessagingModule, MulterModule.register({ storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } })],
  controllers: [DashboardOrganizationSettingsController],
  providers: [
    ...serviceHandlers,
    UpsertBrandingHandler, GetBrandingHandler, GetPublicBrandingHandler, UploadLogoHandler,
    CreateIntakeFormHandler, GetIntakeFormHandler, ListIntakeFormsHandler, DeleteIntakeFormHandler,
    SubmitRatingHandler, ListRatingsHandler,
    GetOrgSettingsHandler, UpsertOrgSettingsHandler,
    GetBookingSettingsHandler, UpsertBookingSettingsHandler,
  ],
  exports: [
    ...serviceHandlers,
    UpsertBrandingHandler, GetBrandingHandler, GetPublicBrandingHandler, UploadLogoHandler,
    CreateIntakeFormHandler, GetIntakeFormHandler, ListIntakeFormsHandler, DeleteIntakeFormHandler,
    SubmitRatingHandler, ListRatingsHandler,
    GetOrgSettingsHandler, UpsertOrgSettingsHandler,
    GetBookingSettingsHandler, UpsertBookingSettingsHandler,
  ],
})
export class OrgExperienceModule {}
