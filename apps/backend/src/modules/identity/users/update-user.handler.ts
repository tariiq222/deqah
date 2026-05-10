import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, UserGender, UserRole } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface UpdateUserCommand {
  userId: string;
  email?: string;
  name?: string;
  phone?: string;
  gender?: UserGender;
  role?: UserRole;
  customRoleId?: string | null;
  avatarUrl?: string;
  isActive?: boolean;
}

const TENANT_USER_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
  UserRole.ACCOUNTANT,
  UserRole.EMPLOYEE,
]);

function toMembershipRole(role: UserRole): MembershipRole {
  if (!TENANT_USER_ROLES.has(role)) {
    throw new BadRequestException('Unsupported dashboard user role');
  }
  return role as unknown as MembershipRole;
}

@Injectable()
export class UpdateUserHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: UpdateUserCommand) {
    const organizationId = this.tenantCtx.requireOrganizationId();
    const user = await this.prisma.user.findFirst({
      where: {
        id: cmd.userId,
        memberships: { some: { organizationId, isActive: true } },
      },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.rlsTx.withTransaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: cmd.userId },
        data: {
          email: cmd.email,
          name: cmd.name,
          phone: cmd.phone,
          gender: cmd.gender,
          role: cmd.role,
          customRoleId: cmd.customRoleId,
          avatarUrl: cmd.avatarUrl,
          isActive: cmd.isActive,
        },
        omit: { passwordHash: true },
      });

      if (cmd.role) {
        await tx.membership.updateMany({
          where: { userId: cmd.userId, organizationId },
          data: { role: toMembershipRole(cmd.role) },
        });
      }

      return updated;
    });
  }
}
