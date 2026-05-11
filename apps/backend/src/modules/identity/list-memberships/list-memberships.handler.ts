import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant';
import type {
  ListMembershipsQuery,
  MembershipSummary,
} from './list-memberships.query';

/**
 * SaaS-06 — List all active organization memberships for the caller.
 *
 * Returns the rows the current user belongs to. `Membership` is in
 * SCOPED_MODELS so a plain `prisma.membership.findMany` is filtered to the
 * current tenant context. We bypass tenant scoping via `$allTenants` inside a
 * CLS run with SUPER_ADMIN_CONTEXT_CLS_KEY so the user sees all their orgs.
 */
@Injectable()
export class ListMembershipsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async execute(query: ListMembershipsQuery): Promise<MembershipSummary[]> {
    const rows = await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      return this.prisma.$allTenants.membership.findMany({
        where: { userId: query.userId, isActive: true },
        include: {
          organization: {
            select: {
              id: true,
              slug: true,
              nameAr: true,
              nameEn: true,
              status: true,
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });
    });

    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      role: r.role,
      isActive: r.isActive,
      displayName: r.displayName,
      jobTitle: r.jobTitle,
      avatarUrl: r.avatarUrl,
      organization: {
        id: r.organization.id,
        slug: r.organization.slug,
        nameAr: r.organization.nameAr,
        nameEn: r.organization.nameEn,
        status: r.organization.status,
      },
    }));
  }
}
