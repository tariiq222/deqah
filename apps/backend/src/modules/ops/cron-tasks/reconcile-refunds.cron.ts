import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { MoyasarApiClient } from '../../finance/moyasar-api/moyasar-api.client';

/**
 * Reconciles RefundRequest rows that are stuck in PROCESSING.
 *
 * A row lands in PROCESSING when:
 *   1. Moyasar accepted the refund (money moved), AND
 *   2. Our finalize DB transaction failed (or the process crashed).
 *
 * This cron polls Moyasar for each stuck row and:
 *   - 'paid'    → flip RefundRequest to COMPLETED + Payment to REFUNDED + Invoice to REFUNDED
 *   - 'failed'  → flip RefundRequest to FAILED
 *   - 'pending' → leave as-is; Moyasar is still processing
 *
 * Rows with no gatewayRef are skipped — they have no Moyasar refund to query.
 *
 * Schedule: every 15 minutes (wired in CronTasksService).
 */
@Injectable()
export class ReconcileRefundsCron {
  private readonly logger = new Logger(ReconcileRefundsCron.name);

  /** A row is considered "stuck" if it has been in PROCESSING for more than 15 min. */
  private static readonly STALE_THRESHOLD_MS = 15 * 60 * 1_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly moyasar: MoyasarApiClient,
  ) {}

  async execute(): Promise<void> {
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      await this.reconcile();
    });
  }

  private async reconcile(): Promise<void> {
    const cutoff = new Date(Date.now() - ReconcileRefundsCron.STALE_THRESHOLD_MS);

    const stuckRows = await this.prisma.$allTenants.refundRequest.findMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: cutoff },
        gatewayRef: { not: null },
      },
      select: {
        id: true,
        organizationId: true,
        paymentId: true,
        invoiceId: true,
        gatewayRef: true,
      },
    });

    if (stuckRows.length === 0) return;

    this.logger.log(`reconcile-refunds: found ${stuckRows.length} stuck row(s)`);

    for (const row of stuckRows) {
      // gatewayRef is guaranteed non-null by the query filter above
      const gatewayRef = row.gatewayRef as string;
      try {
        await this.processRow(row.id, row.organizationId, row.paymentId, row.invoiceId, gatewayRef);
      } catch (err) {
        this.logger.error(
          `reconcile-refunds: failed to process RefundRequest ${row.id}`,
          err instanceof Error ? err.stack : err,
        );
        // Continue with next row — don't let one failure abort the whole batch.
      }
    }
  }

  private async processRow(
    refundRequestId: string,
    organizationId: string,
    paymentId: string,
    invoiceId: string,
    gatewayRef: string,
  ): Promise<void> {
    const { status } = await this.moyasar.getRefundStatus(organizationId, gatewayRef);

    if (status === 'pending') {
      this.logger.debug(
        `reconcile-refunds: RefundRequest ${refundRequestId} still pending at Moyasar — skipping`,
      );
      return;
    }

    if (status === 'failed') {
      await this.prisma.$allTenants.refundRequest.update({
        where: { id: refundRequestId },
        data: { status: 'FAILED' },
      });
      this.logger.warn(
        `reconcile-refunds: RefundRequest ${refundRequestId} → FAILED (Moyasar reported failure)`,
      );
      return;
    }

    // status === 'paid' — finalize atomically
    if (status === 'paid') {
      await this.prisma.$allTenants.$transaction(async (tx) => {
        await tx.refundRequest.update({
          where: { id: refundRequestId },
          data: { status: 'COMPLETED' },
        });
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'REFUNDED' },
        });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: 'REFUNDED' },
        });
      });
      this.logger.log(
        `reconcile-refunds: RefundRequest ${refundRequestId} → COMPLETED (reconciled from Moyasar 'paid')`,
      );
    }
  }
}

