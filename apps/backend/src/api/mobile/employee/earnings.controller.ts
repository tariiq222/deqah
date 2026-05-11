import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { IsDateString, IsOptional } from 'class-validator';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiOkResponse,
} from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiStandardResponses } from '../../../common/swagger';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../../common/guards/casl.guard';
import { CurrentUser, JwtUser } from '../../../common/auth/current-user.decorator';
import { PrismaService } from '../../../infrastructure/database';

export class EarningsQuery {
  @ApiPropertyOptional({ description: 'Start of earnings period (ISO 8601); defaults to first day of current month', example: '2026-04-01' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ description: 'End of earnings period (ISO 8601); defaults to last day of current month', example: '2026-04-30' })
  @IsOptional() @IsDateString() to?: string;
}

@ApiTags('Mobile Employee / Earnings')
@ApiBearerAuth()
@ApiStandardResponses()
@UseGuards(JwtGuard, CaslGuard)
@Controller('mobile/employee/earnings')
export class MobileEmployeeEarningsController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Get earnings summary for the authenticated employee within a date range' })
  @ApiOkResponse({
    description: 'Earnings totals and breakdown by payment method for the requested period',
    schema: {
      type: 'object',
      properties: {
        period: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
        },
        totalEarnings: { type: 'number', example: 4500 },
        invoiceCount: { type: 'number', example: 12 },
        byMethod: {
          type: 'object',
          additionalProperties: { type: 'number' },
          example: { CARD: 3000, CASH: 1500 },
        },
      },
    },
  })
@ApiQuery({ name: 'from', required: false, description: 'Start of earnings period (ISO 8601)', example: '2026-04-01' })
  @ApiQuery({ name: 'to', required: false, description: 'End of earnings period (ISO 8601)', example: '2026-04-30' })
  @Get()
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  async earnings(
    @CurrentUser() user: JwtUser,
    @Query() q: EarningsQuery,
  ) {
    const now = new Date();
    const from = q.from
      ? new Date(q.from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.to
      ? new Date(q.to)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        employeeId: user.sub,
        status: InvoiceStatus.PAID,
        paidAt: { gte: from, lte: to },
      },
      include: {
        payments: { select: { amount: true, method: true } },
      },
    });

    const totalEarnings = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const byMethod: Record<string, number> = {};
    for (const inv of invoices) {
      for (const p of inv.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
      }
    }

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totalEarnings,
      invoiceCount: invoices.length,
      byMethod,
    };
  }
}
