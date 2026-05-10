import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SubscriptionInvoiceStatus } from '@prisma/client';

/**
 * Phase 7 — query DTO for the tenant invoice list endpoint. Status filter
 * accepts the existing 5-value enum (DRAFT | DUE | PAID | FAILED | VOID);
 * Phase 7 introduces no new statuses.
 */
export class ListInvoicesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(SubscriptionInvoiceStatus)
  status?: SubscriptionInvoiceStatus;
}

export class InvoiceListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** null while DRAFT/DUE pre-issuance; non-null once issued. */
  @ApiPropertyOptional({ nullable: true })
  invoiceNumber!: string | null;

  @ApiProperty({ enum: SubscriptionInvoiceStatus })
  status!: SubscriptionInvoiceStatus;

  /** VAT-inclusive total, fixed-2 string. */
  @ApiProperty({ example: '299.00' })
  amount!: string;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ format: 'date-time' })
  periodStart!: string;

  @ApiProperty({ format: 'date-time' })
  periodEnd!: string;

  /** null = not yet issued. */
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  issuedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  paidAt!: string | null;

  /** Zoho invoice portal URL — null when not yet mirrored. */
  @ApiPropertyOptional({
    description: 'Zoho-hosted invoice URL',
    nullable: true,
    example: 'https://invoice.zoho.com/portal/deqah/invoice/...',
  })
  zohoInvoiceUrl!: string | null;

  /** Zoho-hosted PDF download URL — null when not yet mirrored. */
  @ApiPropertyOptional({
    description: 'Zoho-hosted PDF URL',
    nullable: true,
    example: 'https://invoice.zoho.com/portal/deqah/invoice/.../pdf',
  })
  zohoPdfUrl!: string | null;
}

export class InvoiceDetailDto extends InvoiceListItemDto {
  @ApiPropertyOptional({ nullable: true })
  invoiceHash!: string | null;

  @ApiPropertyOptional({ nullable: true })
  previousHash!: string | null;

  /** @deprecated Local PDF storage removed. Use zohoPdfUrl instead. */
  @ApiPropertyOptional({ nullable: true, deprecated: true })
  pdfStorageKey!: string | null;
}
