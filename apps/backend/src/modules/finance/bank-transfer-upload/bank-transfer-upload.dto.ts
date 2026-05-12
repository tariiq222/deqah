import { IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Metadata sent alongside the receipt file in multipart/form-data.
 * The file bytes come through @UploadedFile() and are not part of this DTO.
 */
export class BankTransferUploadDto {
  @ApiProperty({ description: 'Invoice being paid', example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID() invoiceId!: string;

  @ApiProperty({ description: 'Transfer amount', example: 100.00 })
  @IsNumber() @Min(0) @Type(() => Number) amount!: number;
}
