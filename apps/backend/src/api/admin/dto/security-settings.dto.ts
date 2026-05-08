import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsCidrOrIpArray } from '../../../common/validators/is-cidr-or-ip.validator';

export class SecuritySettingsDto {
  @ApiProperty({ description: 'Session TTL in minutes', example: 60 })
  sessionTtlMinutes!: number;

  @ApiProperty({ description: 'Require 2FA for super-admin accounts', example: true })
  require2fa!: boolean;

  @ApiProperty({ description: 'IP allowlist for super-admin access (CIDR)', type: [String], example: ['10.0.0.0/8'] })
  ipAllowlist!: string[];
}

export class UpdateSecuritySettingsDto {
  @ApiPropertyOptional({ description: 'Session TTL in minutes (5-1440)', example: 60 })
  @IsOptional() @IsInt() @Min(5) @Max(1440) sessionTtlMinutes?: number;

  @ApiPropertyOptional({ description: 'Require 2FA for super-admin accounts' })
  @IsOptional() @IsBoolean() require2fa?: boolean;

  @ApiPropertyOptional({ description: 'IP allowlist (CIDR)', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) @IsCidrOrIpArray() ipAllowlist?: string[];
}
