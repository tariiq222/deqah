import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { FileVisibility } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body fields for multipart upload. The actual file bytes come via
 * @UploadedFile(); these are metadata sent alongside the file.
 *
 * `uploadedBy` is intentionally absent — it is set server-side from the
 * authenticated JWT (`req.user.sub`) by the controller. Accepting a
 * caller-supplied identity here would let any tenant member forge audit
 * trails by impersonating another user.
 */
export class UploadFileDto {
  @ApiPropertyOptional({
    description: 'Storage visibility — PUBLIC files are accessible via CDN, PRIVATE require a presigned URL',
    enum: FileVisibility,
    example: 'PUBLIC',
  })
  @IsOptional() @IsEnum(FileVisibility) visibility?: FileVisibility;

  @ApiPropertyOptional({
    description: 'Entity type that owns this file (e.g. Employee, Client, Service)',
    example: 'Employee',
  })
  @IsOptional() @IsString() @MaxLength(32) ownerType?: string;

  @ApiPropertyOptional({
    description: 'UUID of the entity that owns this file',
    example: 'b3d2e1f0-9a8b-7c6d-5e4f-3a2b1c0d9e8f',
  })
  @IsOptional() @IsUUID() ownerId?: string;
}
