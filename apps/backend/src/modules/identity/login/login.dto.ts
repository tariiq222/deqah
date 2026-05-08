import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Account password (min 8 characters)', example: 'P@ssw0rd123', format: 'password' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: 'Captcha verification token (ignored — kept for client compatibility until Cloudflare Turnstile lands)' })
  @IsOptional()
  @IsString()
  hCaptchaToken?: string;
}
