import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { PasswordService } from '../shared/password.service';
import { CreateUserDto } from './create-user.dto';

export type CreateUserCommand = CreateUserDto;

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
export class CreateUserHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tenantCtx: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: CreateUserCommand) {
    const existing = await this.prisma.user.findUnique({
      where: { email: cmd.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const organizationId = this.tenantCtx.requireOrganizationId();
    const membershipRole = toMembershipRole(cmd.role);
    const passwordHash = await this.password.hash(cmd.password);
    return this.rlsTx.withTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: cmd.email,
          passwordHash,
          name: cmd.name,
          role: cmd.role,
          phone: cmd.phone,
          gender: cmd.gender,
          customRoleId: cmd.customRoleId,
        },
        omit: { passwordHash: true },
      });

      const acceptedAt = new Date();
      await tx.membership.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        create: {
          userId: user.id,
          organizationId,
          role: membershipRole,
          isActive: true,
          acceptedAt,
        },
        update: {
          role: membershipRole,
          isActive: true,
          acceptedAt,
        },
      });

      return user;
    });
  }
}
