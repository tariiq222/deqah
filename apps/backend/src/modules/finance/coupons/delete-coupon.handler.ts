import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface DeleteCouponCommand { couponId: string; }

@Injectable()
export class DeleteCouponHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: DeleteCouponCommand): Promise<void> {
    const [coupon, redemptionCount] = await Promise.all([
      this.prisma.coupon.findFirst({ where: { id: cmd.couponId } }),
      this.prisma.couponRedemption.count({ where: { couponId: cmd.couponId } }),
    ]);
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (redemptionCount > 0) {
      throw new BadRequestException('Cannot delete coupon with existing redemptions');
    }
    await this.prisma.coupon.delete({ where: { id: cmd.couponId } });
  }
}
