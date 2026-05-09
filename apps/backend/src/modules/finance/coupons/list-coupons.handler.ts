import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { toListResponse } from '../../../common/dto';
import { ListCouponsDto } from './list-coupons.dto';

export type ListCouponsQuery = ListCouponsDto;

@Injectable()
export class ListCouponsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListCouponsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.search) {
      where['code'] = { contains: query.search, mode: 'insensitive' };
    }
    if (query.status === 'active') where['isActive'] = true;
    else if (query.status === 'inactive') where['isActive'] = false;
    else if (query.status === 'expired') {
      where['expiresAt'] = { lt: new Date() };
      where['isActive'] = true;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.coupon.count({ where }),
    ]);

    return toListResponse(items, total, page, limit);
  }
}
