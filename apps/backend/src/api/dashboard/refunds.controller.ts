import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { ListRefundsHandler } from '../../modules/finance/refund-payment/list-refunds.handler';
import { ApproveRefundHandler } from '../../modules/finance/refund-payment/approve-refund.handler';
import { DenyRefundHandler } from '../../modules/finance/refund-payment/deny-refund.handler';

class ApproveRefundDto {
  refundRequestId!: string;
}

class DenyRefundDto {
  refundRequestId!: string;
  reason!: string;
}

@ApiTags('Dashboard / Refunds')
@ApiBearerAuth()
@Controller('refunds')
@UseGuards(JwtGuard, CaslGuard)
export class RefundsController {
  constructor(
    private readonly listRefundsHandler: ListRefundsHandler,
    private readonly approveRefundHandler: ApproveRefundHandler,
    private readonly denyRefundHandler: DenyRefundHandler,
  ) {}

  @Get()
  @CheckPermissions({ action: 'read', subject: 'Payment' })
  @ApiOperation({ summary: 'List refund requests' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOkResponse({ schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, total: { type: 'number' } } } })
  async listRefunds(@Query('status') status?: string) {
    return this.listRefundsHandler.execute(status);
  }

  @Post('approve')
  @CheckPermissions({ action: 'manage', subject: 'Payment' })
  @ApiOperation({ summary: 'Approve a refund request' })
  @ApiOkResponse({ schema: { type: 'object', description: 'Approved refund result' } })
  async approveRefund(
    @Body() dto: ApproveRefundDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.approveRefundHandler.execute({
      refundRequestId: dto.refundRequestId,
      approvedBy: user.sub,
    });
  }

  @Post('deny')
  @CheckPermissions({ action: 'manage', subject: 'Payment' })
  @ApiOperation({ summary: 'Deny a refund request' })
  @ApiOkResponse({ schema: { type: 'object', description: 'Denied refund result' } })
  async denyRefund(
    @Body() dto: DenyRefundDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.denyRefundHandler.execute({
      refundRequestId: dto.refundRequestId,
      deniedBy: user.sub,
      reason: dto.reason,
    });
  }
}
