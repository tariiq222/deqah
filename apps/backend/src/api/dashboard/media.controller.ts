import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
  ApiCreatedResponse, ApiOkResponse, ApiNoContentResponse, ApiBody, ApiConsumes,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { ApiStandardResponses } from '../../common/swagger';
import { UploadFileHandler } from '../../modules/media/files/upload-file.handler';
import { UploadFileDto } from '../../modules/media/files/upload-file.dto';
import { GetFileHandler } from '../../modules/media/files/get-file.handler';
import { DeleteFileHandler } from '../../modules/media/files/delete-file.handler';
import { GeneratePresignedUrlHandler } from '../../modules/media/files/generate-presigned-url.handler';
import { GeneratePresignedUrlDto } from '../../modules/media/files/generate-presigned-url.dto';

@ApiTags('Dashboard / Media')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard/media')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardMediaController {
  constructor(
    private readonly uploadFile: UploadFileHandler,
    private readonly getFile: GetFileHandler,
    private readonly deleteFile: DeleteFileHandler,
    private readonly generatePresignedUrl: GeneratePresignedUrlHandler,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file to object storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'File to upload' },
        visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'], description: 'Storage visibility', example: 'PUBLIC' },
        ownerType: { type: 'string', description: 'Entity type that owns the file', example: 'Employee' },
        ownerId: { type: 'string', format: 'uuid', description: 'UUID of the owning entity', example: 'b3d2e1f0-9a8b-7c6d-5e4f-3a2b1c0d9e8f' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        url: { type: 'string' },
        filename: { type: 'string' },
        mimetype: { type: 'string' },
        size: { type: 'number' },
        visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  uploadFileEndpoint(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFileDto,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    return this.uploadFile.execute(
      {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        ...body,
        uploadedBy: user.sub,
      },
      file.buffer,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the file', example: 'b3d2e1f0-9a8b-7c6d-5e4f-3a2b1c0d9e8f' })
  @ApiOkResponse({
    description: 'File metadata returned',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        url: { type: 'string' },
        filename: { type: 'string' },
        mimetype: { type: 'string' },
        size: { type: 'number' },
        visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @ApiNotFoundResponse({ description: 'File not found' })
  getFileEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getFile.execute(id);
  }

  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the file to delete', example: 'b3d2e1f0-9a8b-7c6d-5e4f-3a2b1c0d9e8f' })
  @ApiNoContentResponse({ description: 'File deleted successfully' })
  @ApiNotFoundResponse({ description: 'File not found' })
  deleteFileEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deleteFile.execute(id);
  }

  @Get(':id/presigned-url')
  @ApiOperation({ summary: 'Generate a presigned URL for temporary file access' })
  @ApiParam({ name: 'id', description: 'UUID of the file', example: 'b3d2e1f0-9a8b-7c6d-5e4f-3a2b1c0d9e8f' })
  @ApiQuery({ name: 'expirySeconds', required: false, description: 'URL validity in seconds (60–86400)', example: 3600 })
  @ApiOkResponse({
    description: 'Presigned URL generated',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://storage.example.com/file?X-Amz-Signature=...' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @ApiNotFoundResponse({ description: 'File not found' })
  presignedUrlEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GeneratePresignedUrlDto,
  ) {
    return this.generatePresignedUrl.execute({
      fileId: id,
      ...query,
    });
  }
}
