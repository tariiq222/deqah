import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/guards/jwt.guard';
import { HandleZohoWebhookHandler } from '../../modules/integrations/zoho-invoice/webhooks/handle-event.handler';

/**
 * Public endpoint Zoho posts to. The path token is the tenant's Deqah
 * organizationId for tenant→client mirror events, or the literal
 * `platform` for events on Deqah's own SaaS-billing Zoho org.
 *
 * **Rate limiting**: Two layers:
 *   1. The global ThrottlerGuard (app.module) applies a 300/min limit per IP.
 *   2. The handler-level @Throttle uses per-tenant keying: `zoho-wh:<tenantToken>`.
 *      This allows 60 req/min per tenant with a burst of 20.
 *      Even if a single tenant's Zoho org floods us, other tenants are unaffected.
 *
 * The endpoint is signature-verified with a per-tenant secret (see
 * `ZohoWebhookVerifier`); it never trusts the path alone.
 */
@ApiTags('Public / Zoho')
@Controller('public/webhooks/zoho')
export class PublicZohoWebhookController {
  constructor(private readonly handler: HandleZohoWebhookHandler) {}

  @Public()
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 60,
      /**
       * Override the throttle tracker so each tenant gets its own bucket.
       * Default NestJS throttler uses req.ip which would punish all tenants
       * sharing an IP (e.g. Zoho's webhook egress pool).
       */
      getTracker: (req: Record<string, unknown>) => {
        // Extract tenantToken from the route params — NestJS populates
        // req.params by the time guards/interceptors run.
        const params = (req as { params?: Record<string, string> }).params;
        const token = params?.tenantToken ?? 'unknown';
        return `zoho-wh:${token}`;
      },
    },
  })
  @Post(':tenantToken')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive Zoho Invoice webhook events (mirror-only)' })
  @ApiOkResponse({
    schema: { type: 'object', properties: { received: { type: 'boolean' } } },
  })
  async handle(
    @Param('tenantToken') tenantToken: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-zoho-webhook-signature') signature: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    const rawBody = req.rawBody?.toString('utf8');
    if (!rawBody) {
      throw new BadRequestException('Missing request body');
    }
    return this.handler.execute({
      tenantToken,
      rawBody,
      signature,
      payload,
    });
  }
}
