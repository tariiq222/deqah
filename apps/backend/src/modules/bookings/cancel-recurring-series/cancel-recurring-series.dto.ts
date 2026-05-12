import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationReason } from '@prisma/client';

export class CancelRecurringSeriesDto {
  @ApiProperty({ description: 'Recurring group ID', example: 'uuid' })
  @IsString()
  recurringGroupId!: string;

  @ApiPropertyOptional({ description: 'Cancel from this date onwards (ISO). If omitted, cancels all.', example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ enum: CancellationReason })
  @IsEnum(CancellationReason)
  reason!: CancellationReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancelNotes?: string;
}
