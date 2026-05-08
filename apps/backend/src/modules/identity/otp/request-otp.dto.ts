import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { NormalizePhoneOrEmail } from '../shared/normalize-phone.transform';

export class RequestOtpDto {
  @ApiProperty({ enum: OtpChannel, description: 'OTP delivery channel', example: 'EMAIL' })
  @IsEnum(OtpChannel)
  channel!: OtpChannel;

  @ApiProperty({ description: 'Email address or phone number (E.164 format)', example: 'user@example.com' })
  @IsNotEmpty()
  @IsString()
  @NormalizePhoneOrEmail()
  identifier!: string;

  @ApiProperty({ enum: OtpPurpose, description: 'Purpose of the OTP', example: 'GUEST_BOOKING' })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @ApiPropertyOptional({ description: 'Captcha token (ignored — kept for client compatibility until Cloudflare Turnstile lands)', example: '10000000-aaaa-bbbb-cccc-000000000001' })
  @IsOptional()
  @IsString()
  hCaptchaToken?: string;

  @ApiPropertyOptional({ description: 'Target organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string;
}
