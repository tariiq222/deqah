import {
  Controller, Get, Post, Patch, Put, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiResponse,
  ApiConsumes, ApiBody,
} from '@nestjs/swagger';
import { ApiStandardResponses } from '../../common/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { CreateServiceHandler } from '../../modules/org-experience/services/create-service.handler';
import { CreateServiceDto } from '../../modules/org-experience/services/create-service.dto';
import { UpdateServiceHandler } from '../../modules/org-experience/services/update-service.handler';
import { UpdateServiceDto } from '../../modules/org-experience/services/update-service.dto';
import { ListServicesHandler } from '../../modules/org-experience/services/list-services.handler';
import { ListServicesDto } from '../../modules/org-experience/services/list-services.dto';
import { GetServiceHandler } from '../../modules/org-experience/services/get-service.handler';
import { ArchiveServiceHandler } from '../../modules/org-experience/services/archive-service.handler';
import { SetServiceBookingConfigsHandler } from '../../modules/org-experience/services/set-service-booking-configs.handler';
import { SetServiceBookingConfigsDto } from '../../modules/org-experience/services/set-service-booking-configs.dto';
import { GetServiceBookingConfigsHandler } from '../../modules/org-experience/services/get-service-booking-configs.handler';
import { ListServiceEmployeesHandler } from '../../modules/org-experience/services/list-service-employees.handler';
import { UpsertBrandingHandler } from '../../modules/org-experience/branding/upsert-branding.handler';
import { UpsertBrandingDto } from '../../modules/org-experience/branding/upsert-branding.dto';
import { GetBrandingHandler } from '../../modules/org-experience/branding/get-branding.handler';
import { CreateIntakeFormHandler } from '../../modules/org-experience/intake-forms/create-intake-form.handler';
import { CreateIntakeFormDto } from '../../modules/org-experience/intake-forms/create-intake-form.dto';
import { GetIntakeFormHandler } from '../../modules/org-experience/intake-forms/get-intake-form.handler';
import { ListIntakeFormsHandler } from '../../modules/org-experience/intake-forms/list-intake-forms.handler';
import { ListIntakeFormsDto } from '../../modules/org-experience/intake-forms/list-intake-forms.dto';
import { DeleteIntakeFormHandler } from '../../modules/org-experience/intake-forms/delete-intake-form.handler';
import { SubmitRatingHandler } from '../../modules/org-experience/ratings/submit-rating.handler';
import { SubmitRatingDto } from '../../modules/org-experience/ratings/submit-rating.dto';
import { ListRatingsHandler } from '../../modules/org-experience/ratings/list-ratings.handler';
import { ListRatingsDto } from '../../modules/org-experience/ratings/list-ratings.dto';
import { GetOrgSettingsHandler } from '../../modules/org-experience/org-settings/get-org-settings.handler';
import { UpsertOrgSettingsHandler } from '../../modules/org-experience/org-settings/upsert-org-settings.handler';
import { UpsertOrgSettingsDto } from '../../modules/org-experience/org-settings/upsert-org-settings.dto';
import { GetBookingSettingsHandler } from '../../modules/bookings/get-booking-settings/get-booking-settings.handler';
import { UpsertBookingSettingsHandler } from '../../modules/bookings/upsert-booking-settings/upsert-booking-settings.handler';
import { UpsertBookingSettingsDto } from '../../modules/bookings/upsert-booking-settings/upsert-booking-settings.dto';
import { UploadLogoHandler } from '../../modules/org-experience/branding/upload-logo/upload-logo.handler';
import { PrismaService } from '../../infrastructure/database';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { SeedOrganizationFromVerticalHandler } from '../../modules/platform/verticals/seed-organization-from-vertical.handler';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class SeedVerticalDto {
  @ApiProperty({ description: 'Vertical slug to seed (e.g. clinic, salon)', example: 'clinic' })
  @IsString() verticalSlug!: string;
}

@ApiTags('Dashboard / Org Experience')
@ApiBearerAuth()
@ApiStandardResponses()
@UseGuards(JwtGuard, CaslGuard)
@Controller('dashboard/organization')
export class DashboardOrganizationSettingsController {
  constructor(
    private readonly createService: CreateServiceHandler,
    private readonly updateService: UpdateServiceHandler,
    private readonly listServices: ListServicesHandler,
    private readonly getService: GetServiceHandler,
    private readonly archiveService: ArchiveServiceHandler,
    private readonly upsertBranding: UpsertBrandingHandler,
    private readonly getBranding: GetBrandingHandler,
    private readonly uploadLogo: UploadLogoHandler,
    private readonly createIntakeForm: CreateIntakeFormHandler,
    private readonly getIntakeForm: GetIntakeFormHandler,
    private readonly listIntakeForms: ListIntakeFormsHandler,
    private readonly deleteIntakeForm: DeleteIntakeFormHandler,
    private readonly submitRating: SubmitRatingHandler,
    private readonly listRatings: ListRatingsHandler,
    private readonly getOrgSettings: GetOrgSettingsHandler,
    private readonly upsertOrgSettings: UpsertOrgSettingsHandler,
    private readonly getBookingSettings: GetBookingSettingsHandler,
    private readonly upsertBookingSettings: UpsertBookingSettingsHandler,
    private readonly setServiceBookingConfigs: SetServiceBookingConfigsHandler,
    private readonly getServiceBookingConfigs: GetServiceBookingConfigsHandler,
    private readonly listServiceEmployees: ListServiceEmployeesHandler,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly seedFromVertical: SeedOrganizationFromVerticalHandler,
  ) {}

  // ── Services ─────────────────────────────────────────────────────────────

  @Post('services')
  @CheckPermissions({ action: 'create', subject: 'Service' })
  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ description: 'Service created' })
  createServiceEndpoint(@Body() body: CreateServiceDto) {
    return this.createService.execute(body);
  }

  @Get('services')
  @CheckPermissions({ action: 'read', subject: 'Service' })
  @ApiOperation({ summary: 'List services' })
  @ApiOkResponse({ description: 'Paginated list of services' })
  listServicesEndpoint(@Query() query: ListServicesDto) {
    return this.listServices.execute(query);
  }

  @Get('services/:serviceId')
  @CheckPermissions({ action: 'read', subject: 'Service' })
  @ApiOperation({ summary: 'Get a service by id' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Service details' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  getServiceEndpoint(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.getService.execute({ serviceId });
  }

  @Patch('services/:serviceId')
  @CheckPermissions({ action: 'update', subject: 'Service' })
  @ApiOperation({ summary: 'Update a service' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Service updated' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  updateServiceEndpoint(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() body: UpdateServiceDto,
  ) {
    return this.updateService.execute({ serviceId, ...body });
  }

  @Delete('services/:serviceId')
  @CheckPermissions({ action: 'delete', subject: 'Service' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a service' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Service archived' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  archiveServiceEndpoint(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.archiveService.execute({ serviceId });
  }

  @Get('services/:serviceId/employees')
  @CheckPermissions({ action: 'read', subject: 'Service' })
  @ApiOperation({ summary: 'List active employees who offer this service' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'List of employees for the service' })
  listServiceEmployeesEndpoint(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.listServiceEmployees.execute({ serviceId });
  }

  @Get('services/:serviceId/booking-types')
  @CheckPermissions({ action: 'read', subject: 'Service' })
  @ApiOperation({ summary: 'Get booking type configs for a service' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Booking type configs' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  getServiceBookingTypesEndpoint(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.getServiceBookingConfigs.execute({ serviceId });
  }

  @Put('services/:serviceId/booking-types')
  @CheckPermissions({ action: 'update', subject: 'Service' })
  @ApiOperation({ summary: 'Set booking type configs for a service' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Booking type configs updated' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  setServiceBookingTypesEndpoint(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() body: SetServiceBookingConfigsDto,
  ) {
    return this.setServiceBookingConfigs.execute({ serviceId, ...body });
  }

  // ── Branding ──────────────────────────────────────────────────────────────

  @Post('branding')
  @CheckPermissions({ action: 'update', subject: 'Branding' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert clinic branding' })
  @ApiOkResponse({ description: 'Branding saved' })
  upsertBrandingEndpoint(@Body() body: UpsertBrandingDto) {
    return this.upsertBranding.execute(body);
  }

  @Get('branding')
  @CheckPermissions({ action: 'read', subject: 'Branding' })
  @ApiOperation({ summary: 'Get clinic branding' })
  @ApiOkResponse({ description: 'Current branding config' })
  getBrandingEndpoint() {
    return this.getBranding.execute();
  }

  @Post('branding/logo')
  @CheckPermissions({ action: 'update', subject: 'Branding' })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload clinic logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ description: 'Logo uploaded, URL returned' })
  uploadLogoEndpoint(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadLogo.execute(
      {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      file.buffer,
    );
  }

  // ── Intake Forms ──────────────────────────────────────────────────────────

  @Post('intake-forms')
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @ApiOperation({ summary: 'Create an intake form' })
  @ApiCreatedResponse({ description: 'Intake form created' })
  @RequireFeature(FeatureKey.INTAKE_FORMS)
  createIntakeFormEndpoint(@Body() body: CreateIntakeFormDto) {
    return this.createIntakeForm.execute(body);
  }

  @Get('intake-forms')
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @ApiOperation({ summary: 'List intake forms' })
  @ApiOkResponse({ description: 'List of intake forms' })
  @RequireFeature(FeatureKey.INTAKE_FORMS)
  listIntakeFormsEndpoint(@Query() query: ListIntakeFormsDto) {
    return this.listIntakeForms.execute(query);
  }

  @Get('intake-forms/:formId')
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @ApiOperation({ summary: 'Get an intake form by ID' })
  @ApiParam({ name: 'formId', description: 'Intake form UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Intake form detail' })
  @ApiResponse({ status: 404, description: 'Intake form not found' })
  @RequireFeature(FeatureKey.INTAKE_FORMS)
  getIntakeFormEndpoint(@Param('formId', ParseUUIDPipe) formId: string) {
    return this.getIntakeForm.execute({ formId });
  }

  @Delete('intake-forms/:formId')
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an intake form' })
  @ApiParam({ name: 'formId', description: 'Intake form UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Intake form deleted' })
  @ApiResponse({ status: 404, description: 'Intake form not found' })
  @RequireFeature(FeatureKey.INTAKE_FORMS)
  deleteIntakeFormEndpoint(@Param('formId', ParseUUIDPipe) formId: string) {
    return this.deleteIntakeForm.execute({ formId });
  }

  // ── Ratings ───────────────────────────────────────────────────────────────

  @Post('ratings')
  @CheckPermissions({ action: 'create', subject: 'Booking' })
  @RequireFeature(FeatureKey.CLIENT_RATINGS)
  @ApiOperation({ summary: 'Submit a rating for a booking' })
  @ApiCreatedResponse({ description: 'Rating submitted' })
  submitRatingEndpoint(@Body() body: SubmitRatingDto) {
    return this.submitRating.execute(body);
  }

  @Get('ratings')
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @RequireFeature(FeatureKey.CLIENT_RATINGS)
  @ApiOperation({ summary: 'List ratings' })
  @ApiOkResponse({ description: 'Paginated list of ratings' })
  listRatingsEndpoint(@Query() query: ListRatingsDto) {
    return this.listRatings.execute(query);
  }

  // ── Organization Settings ─────────────────────────────────────────────────

  @Get('settings')
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @ApiOperation({ summary: 'Get organization settings' })
  @ApiOkResponse({ description: 'Current organization settings' })
  getOrgSettingsEndpoint() {
    return this.getOrgSettings.execute();
  }

  @Patch('settings')
  @CheckPermissions({ action: 'update', subject: 'Setting' })
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiOkResponse({ description: 'Organization settings updated' })
  upsertOrgSettingsEndpoint(@Body() body: UpsertOrgSettingsDto) {
    return this.upsertOrgSettings.execute(body);
  }

  // ── Booking Settings ──────────────────────────────────────────────────────

  @Get('booking-settings')
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @ApiOperation({ summary: 'Get booking settings' })
  @ApiOkResponse({ description: 'Current booking settings' })
  getBookingSettingsEndpoint() {
    return this.getBookingSettings.execute({ branchId: null });
  }

  @Patch('booking-settings')
  @CheckPermissions({ action: 'update', subject: 'Setting' })
  @ApiOperation({ summary: 'Update booking settings' })
  @ApiOkResponse({ description: 'Booking settings updated' })
  upsertBookingSettingsEndpoint(@Body() body: UpsertBookingSettingsDto) {
    return this.upsertBookingSettings.execute({ branchId: null, ...body });
  }

  @Patch('mark-onboarded')
  @CheckPermissions({ action: 'update', subject: 'Setting' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark the organization onboarding wizard as completed' })
  @ApiNoContentResponse({ description: 'Onboarding marked complete' })
  async markOnboardedEndpoint() {
    const organizationId = this.tenant.requireOrganizationId();
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { onboardingCompletedAt: new Date() },
    });
  }

  @Post('seed-vertical')
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed organization with departments + service categories from a vertical',
    description:
      'Idempotent: skips when departments already exist. Also stamps Organization.verticalId so '
      + 'useTerminology() resolves the right pack on /auth/me.',
  })
  @ApiOkResponse({ description: 'Seed result (skipped if already seeded)' })
  async seedVerticalEndpoint(@Body() body: SeedVerticalDto) {
    const organizationId = this.tenant.requireOrganizationId();
    const vertical = await this.prisma.vertical.findFirst({
      where: { slug: body.verticalSlug, isActive: true },
      select: { id: true },
    });
    if (vertical) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { verticalId: vertical.id },
      });
    }
    return this.seedFromVertical.execute({
      organizationId,
      verticalSlug: body.verticalSlug,
    });
  }
}
