import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class GetTopPerformersDto {
  @ApiPropertyOptional({ description: 'Period for aggregation', enum: ['month'], example: 'month' })
  @IsOptional()
  @IsIn(['month'])
  period?: 'month' = 'month';
}
