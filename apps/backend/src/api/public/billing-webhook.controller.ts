import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { MoyasarSubscriptionWebhookHandler } from '../../modules/finance/moyasar-api/moyasar-subscription-webhook.handler';

@ApiTags('Public / Billing')
@Controller('public/billing/webhooks/moyasar')
export class BillingWebhookController {
  constructor(private readonly handler: MoyasarSubscriptionWebhookHandler) {}

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive Moyasar billing webhook events' })
  @ApiOkResponse({ schema: { type: 'object', properties: { received: { type: 'boolean' } } } })
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-moyasar-signature') signature: string,
  ) {
    return this.handler.execute(req.rawBody!, signature);
  }
}
