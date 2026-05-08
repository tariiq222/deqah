import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePresignedUrlDto {
  @ApiPropertyOptional({
    description: 'Validity duration of the presigned URL in seconds (60–900)',
    minimum: 60,
    maximum: 900,
    example: 600,
  })
  @IsOptional() @IsInt() @Min(60) @Max(900) @Type(() => Number) expirySeconds?: number;
}
