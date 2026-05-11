import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardResponses } from '../../common/swagger';
import { JwtGuard, Public } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';

import { StartConnectHandler } from '../../modules/integrations/zoho-invoice/connect/start-connect.handler';
import { OAuthCallbackHandler } from '../../modules/integrations/zoho-invoice/connect/oauth-callback.handler';
import { SelectOrganizationHandler } from '../../modules/integrations/zoho-invoice/connect/select-organization.handler';
import { DisconnectHandler } from '../../modules/integrations/zoho-invoice/connect/disconnect.handler';
import { GetZohoConfigHandler } from '../../modules/integrations/zoho-invoice/config/get-zoho-config.handler';
import { UpdateZohoConfigHandler } from '../../modules/integrations/zoho-invoice/config/update-zoho-config.handler';
import { TestZohoConfigHandler } from '../../modules/integrations/zoho-invoice/config/test-zoho-config.handler';
import { ListZohoInvoicesHandler } from '../../modules/integrations/zoho-invoice/invoices/list-invoices.handler';
import { ListPaymentMirrorsHandler } from '../../modules/integrations/zoho-invoice/payments/list-payment-mirrors.handler';
import { GetZohoInvoiceHandler } from '../../modules/integrations/zoho-invoice/invoices/get-invoice.handler';
import { SendZohoInvoiceHandler } from '../../modules/integrations/zoho-invoice/invoices/send-invoice.handler';
import { VoidZohoInvoiceHandler } from '../../modules/integrations/zoho-invoice/invoices/void-invoice.handler';
import {
  ListInvoicesQueryDto,
  SelectOrganizationDto,
  StartConnectDto,
  StartConnectResponseDto,
  UpdateConfigDto,
} from '../../modules/integrations/zoho-invoice/dto/connect.dto';

const FEATURE = FeatureKey.ZOHO_INVOICE_INTEGRATION;

@ApiTags('Dashboard / Integrations / Zoho')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard/integrations/zoho')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardZohoController {
  constructor(
    private readonly startConnect: StartConnectHandler,
    private readonly oauthCallback: OAuthCallbackHandler,
    private readonly selectOrganization: SelectOrganizationHandler,
    private readonly disconnect: DisconnectHandler,
    private readonly getConfig: GetZohoConfigHandler,
    private readonly updateConfig: UpdateZohoConfigHandler,
    private readonly testConfig: TestZohoConfigHandler,
    private readonly listInvoices: ListZohoInvoicesHandler,
    private readonly listPaymentMirrors: ListPaymentMirrorsHandler,
    private readonly getInvoice: GetZohoInvoiceHandler,
    private readonly sendInvoice: SendZohoInvoiceHandler,
    private readonly voidInvoice: VoidZohoInvoiceHandler,
  ) {}

  // ───────── Status ─────────

  @Get()
  @RequireFeature(FEATURE)
  @ApiOperation({ summary: 'Get Zoho Invoice integration status (no secrets)' })
  @ApiOkResponse({
    description: 'Configured + active flags + selected Zoho organization',
  })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  status() {
    return this.getConfig.execute();
  }

  // ───────── Connect ─────────

  @Get('connect')
  @RequireFeature(FEATURE)
  @ApiOperation({ summary: 'Build the Zoho OAuth consent URL' })
  @ApiQuery({
    name: 'dc',
    required: true,
    description: 'Zoho data center: com|sa|eu|in|au|jp|ca',
  })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @ApiOkResponse({ type: StartConnectResponseDto })
  connect(@Query() dto: StartConnectDto): StartConnectResponseDto {
    return this.startConnect.execute(dto);
  }

  /**
   * OAuth redirect target. Public (no Bearer token), state-protected.
   * Returns a 302 to the dashboard so the user lands back where they
   * started with a status query param.
   */
  @Get('callback')
  @Public()
  @Redirect()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Zoho OAuth redirect target — completes Connect flow and 302s back to the dashboard' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('location') location: string | undefined,
    @Query('accounts-server') accountsServer: string | undefined,
  ) {
    const result = await this.oauthCallback.execute({
      code,
      state,
      error,
      location,
      accountsServer,
    });
    return { url: result.dashboardRedirectUrl, statusCode: 302 };
  }

  @Post('select-organization')
  @RequireFeature(FEATURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Select the Zoho organization to use (required when the connected user has more than one SAR org)',
  })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  selectOrg(@Body() dto: SelectOrganizationDto) {
    return this.selectOrganization.execute(dto);
  }

  @Delete()
  @RequireFeature(FEATURE)
  @ApiOperation({
    summary: 'Disconnect Zoho — revokes the refresh token and deletes the integration row',
  })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  removeConnection() {
    return this.disconnect.execute();
  }

  // ───────── Config ─────────

  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Put('config')
  @RequireFeature(FEATURE)
  @ApiOperation({ summary: 'Update tenant defaults (sendOnCreate, item id, payment terms, ...)' })
  update(@Body() dto: UpdateConfigDto) {
    return this.updateConfig.execute(dto);
  }

  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Post('test')
  @RequireFeature(FEATURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate the stored Zoho credentials' })
  test() {
    return this.testConfig.execute();
  }

  // ───────── Invoices proxy ─────────

  @CheckPermissions({ action: 'read', subject: 'Invoice' })
  @Get('invoices')
  @RequireFeature(FEATURE)
  @ApiOperation({ summary: 'List invoices in the connected Zoho organization' })
  list(@Query() query: ListInvoicesQueryDto) {
    return this.listInvoices.execute(query);
  }

  @CheckPermissions({ action: 'read', subject: 'Invoice' })
  @Get('invoices/:id')
  @RequireFeature(FEATURE)
  @ApiOperation({ summary: 'Fetch a Zoho invoice by id' })
  get(@Param('id') id: string) {
    return this.getInvoice.execute(id);
  }

  @CheckPermissions({ action: 'update', subject: 'Invoice' })
  @Post('invoices/:id/send')
  @RequireFeature(FEATURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-send a Zoho invoice via email' })
  send(@Param('id') id: string) {
    return this.sendInvoice.execute(id);
  }

  @CheckPermissions({ action: 'update', subject: 'Invoice' })
  @Post('invoices/:id/void')
  @RequireFeature(FEATURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void a Zoho invoice' })
  void(@Param('id') id: string) {
    return this.voidInvoice.execute(id);
  }

  // ───────── Payments ↔ Zoho mirror ─────────

  @Get('payments-mirror')
  @RequireFeature(FEATURE)
  @ApiOperation({
    summary:
      'List captured Moyasar payments with their Zoho invoice mirror (URL/PDF/status) — used by the dashboard to show a per-client invoice link',
  })
  @CheckPermissions({ action: 'read', subject: 'Payment' })
  paymentMirrors(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.listPaymentMirrors.execute({
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 25,
      clientId,
    });
  }
}
