import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { REQUEST_TX_CLS_KEY } from '../tenant/tenant.constants';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Connection-bound RLS GUC enforcement.
 *
 * Strategy:
 *   1. For every request that has a resolved tenant, open ONE Prisma transaction.
 *   2. Set `app.current_org_id` on that transaction's connection.
 *   3. Pin the TransactionClient into CLS under REQUEST_TX_CLS_KEY.
 *   4. PrismaService proxy reads CLS and routes every model query through this
 *      tx — so every query in the request sees the GUC.
 *   5. On request completion, the transaction commits / rolls back atomically.
 *
 * Result: a single Postgres connection per request, with the tenant GUC pinned
 * to it for the entire request lifetime. RLS policies see the tenant on EVERY
 * query, not just queries that explicitly opt in via RlsHelper.
 *
 * Trade-off: each authenticated request now occupies one pool connection for
 * its full duration. Sizing: ~50-100 concurrent requests need pool size >=100.
 * If a request fans out to long-running external IO (Moyasar, Zoom), it will
 * hold the connection. This is the correct behavior for tenant safety; if it
 * becomes a bottleneck, scale the pool, not the safety guarantee.
 */
@Injectable()
export class TenantGucInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantGucInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly cls: ClsService,
  ) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const orgId = this.ctx.getOrganizationId();
    if (!orgId || !UUID_RE.test(orgId)) {
      // No tenant resolved -- let the handler run unwrapped. Scoped queries
      // will throw via the Prisma extension (strict mode), and RLS policies
      // fail-closed at the DB layer. Both cooperate to reject the request.
      return next.handle();
    }

    return from(
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
        );
        // Pin the tx into CLS so PrismaService.$model accessors see it.
        this.cls.set(REQUEST_TX_CLS_KEY, tx);
        try {
          // Convert the rxjs stream to a promise inside the transaction so
          // the tx commits only after the handler resolves.
          return await next.handle().toPromise();
        } finally {
          // Best-effort cleanup -- even though CLS is request-scoped, an
          // explicit clear avoids stale references if any code outside the
          // request boundary inspects CLS.
          this.cls.set(REQUEST_TX_CLS_KEY, undefined);
        }
      }),
    ).pipe(
      switchMap((value) => from(Promise.resolve(value))),
      catchError((err) => throwError(() => err)),
    );
  }
}
