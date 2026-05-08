import { IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'OTP session JWT received after verifying the CLIENT_PASSWORD_RESET OTP',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  sessionToken!: string;

  @ApiProperty({
    description: 'New password (min 8 chars, at least 1 uppercase letter, at least 1 digit)',
    example: 'NewSecurePass1',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, { message: 'Password must contain at least 1 uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least 1 digit' })
  newPassword!: string;

  @ApiPropertyOptional({ example: '<captcha token>', description: 'Captcha token (ignored — kept for client compatibility until Cloudflare Turnstile lands)' })
  @IsOptional()
  @IsString()
  hCaptchaToken?: string;
}
