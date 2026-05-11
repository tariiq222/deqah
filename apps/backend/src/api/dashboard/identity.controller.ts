import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiResponse,
} from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { ApiStandardResponses, ApiErrorDto } from '../../common/swagger';
import { ListUsersHandler } from '../../modules/identity/users/list-users.handler';
import { GetUserHandler } from '../../modules/identity/users/get-user.handler';
import { CreateUserHandler } from '../../modules/identity/users/create-user.handler';
import { UpdateUserHandler } from '../../modules/identity/users/update-user.handler';
import { DeactivateUserHandler } from '../../modules/identity/users/deactivate-user.handler';
import { DeleteUserHandler } from '../../modules/identity/users/delete-user.handler';
import { AssignRoleHandler } from '../../modules/identity/users/assign-role.handler';
import { RemoveRoleHandler } from '../../modules/identity/users/remove-role.handler';
import { ListRolesHandler } from '../../modules/identity/roles/list-roles.handler';
import { CreateRoleHandler } from '../../modules/identity/roles/create-role.handler';
import { DeleteRoleHandler } from '../../modules/identity/roles/delete-role.handler';
import { AssignPermissionsHandler } from '../../modules/identity/roles/assign-permissions.handler';
import { ListPermissionsHandler } from '../../modules/identity/roles/list-permissions.handler';
import { CreateUserDto } from '../../modules/identity/users/create-user.dto';
import { CreateRoleDto } from '../../modules/identity/roles/create-role.dto';
import { AssignPermissionsDto } from '../../modules/identity/roles/assign-permissions.dto';
import { IsEmail, IsEnum, IsOptional, IsString, IsBoolean, IsInt, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserGender, UserRole } from '@prisma/client';

class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email', example: 'sara' })
  @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ description: 'Results per page', example: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Updated email address', example: 'user@example.com' })
  @IsOptional() @IsEmail() email?: string;

  @ApiPropertyOptional({ description: 'Updated display name', example: 'Sara Al-Harbi' })
  @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional({ description: 'Updated phone number', example: '+966501234567' })
  @IsOptional() @IsString() phone?: string;

  @ApiPropertyOptional({ description: 'Updated gender', enum: UserGender, enumName: 'UserGender', example: UserGender.FEMALE })
  @IsOptional() @IsEnum(UserGender) gender?: UserGender;

  @ApiPropertyOptional({ description: 'Updated system role', enum: UserRole, enumName: 'UserRole', example: UserRole.RECEPTIONIST })
  @IsOptional() @IsEnum(UserRole) role?: UserRole;

  @ApiPropertyOptional({ description: 'Custom role UUID or null to clear', example: '00000000-0000-0000-0000-000000000000', nullable: true })
  @IsOptional() @IsString() customRoleId?: string | null;
}

class AssignRoleDto {
  @ApiProperty({ description: 'UUID of the custom role to assign', example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID() customRoleId!: string;
}

@ApiTags('Dashboard / Identity')
@ApiBearerAuth()
@ApiStandardResponses()
@UseGuards(JwtGuard, CaslGuard)
@Controller('dashboard/identity')
export class DashboardIdentityController {
  constructor(
    private readonly listUsersHandler: ListUsersHandler,
    private readonly getUserHandler: GetUserHandler,
    private readonly createUserHandler: CreateUserHandler,
    private readonly updateUserHandler: UpdateUserHandler,
    private readonly deactivateUserHandler: DeactivateUserHandler,
    private readonly deleteUserHandler: DeleteUserHandler,
    private readonly assignRoleHandler: AssignRoleHandler,
    private readonly removeRoleHandler: RemoveRoleHandler,
    private readonly listRolesHandler: ListRolesHandler,
    private readonly createRoleHandler: CreateRoleHandler,
    private readonly deleteRoleHandler: DeleteRoleHandler,
    private readonly assignPermissionsHandler: AssignPermissionsHandler,
    private readonly listPermissionsHandler: ListPermissionsHandler,
  ) {}

  // ── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  @CheckPermissions({ action: 'read', subject: 'User' })
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or email', example: 'sara' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page', example: 20 })
  @ApiOkResponse({
    description: 'Paginated list of users',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, isActive: { type: 'boolean' } } } },
        total: { type: 'number' },
        page: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.listUsersHandler.execute({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      isActive: query.isActive,
    });
  }

  @Get('users/:id')
  @CheckPermissions({ action: 'read', subject: 'User' })
  @ApiOperation({ summary: 'Get a user' })
  @ApiParam({ name: 'id', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'User details',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string', nullable: true },
        gender: { type: 'string', nullable: true },
        role: { type: 'string' },
        isActive: { type: 'boolean' },
        customRoleId: { type: 'string', format: 'uuid', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async getUserEndpoint(@Param('id', ParseUUIDPipe) userId: string) {
    return this.getUserHandler.execute({ userId });
  }

  @Post('users')
  @CheckPermissions({ action: 'manage', subject: 'User' })
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({
    description: 'User created',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        role: { type: 'string' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async createUserEndpoint(@Body() body: CreateUserDto) {
    return this.createUserHandler.execute(body);
  }

  @Patch('users/:id')
  @CheckPermissions({ action: 'update', subject: 'User' })
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'User updated',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        role: { type: 'string' },
        isActive: { type: 'boolean' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async updateUserEndpoint(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.updateUserHandler.execute({ ...body, userId });
  }

  @Patch('users/:id/deactivate')
  @CheckPermissions({ action: 'manage', subject: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a user' })
  @ApiParam({ name: 'id', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async deactivateUserEndpoint(@Param('id', ParseUUIDPipe) userId: string) {
    await this.deactivateUserHandler.execute({ userId });
  }

  @Patch('users/:id/activate')
  @CheckPermissions({ action: 'manage', subject: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Activate a user' })
  @ApiParam({ name: 'id', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'User activated' })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async activateUserEndpoint(@Param('id', ParseUUIDPipe) userId: string) {
    await this.updateUserHandler.execute({ userId, isActive: true });
  }

  @Delete('users/:id')
  @CheckPermissions({ action: 'manage', subject: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async deleteUserEndpoint(@Param('id', ParseUUIDPipe) userId: string) {
    await this.deleteUserHandler.execute({ userId });
  }

  @Post('users/:userId/roles')
  @CheckPermissions({ action: 'manage', subject: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiParam({ name: 'userId', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Role assigned' })
  @ApiResponse({ status: 404, description: 'User or role not found', type: ApiErrorDto })
  async assignRoleEndpoint(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: AssignRoleDto,
  ) {
    await this.assignRoleHandler.execute({ userId, customRoleId: body.customRoleId });
  }

  @Delete('users/:userId/roles/:roleId')
  @CheckPermissions({ action: 'manage', subject: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a role from a user' })
  @ApiParam({ name: 'userId', description: 'User UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiParam({ name: 'roleId', description: 'Role UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Role removed' })
  @ApiResponse({ status: 404, description: 'User or role not found', type: ApiErrorDto })
  async removeRoleEndpoint(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) customRoleId: string,
  ) {
    await this.removeRoleHandler.execute({ userId, customRoleId });
  }

  // ── Roles ────────────────────────────────────────────────────────────────

  @Get('roles')
  @CheckPermissions({ action: 'read', subject: 'Role' })
  @ApiOperation({ summary: 'List custom roles' })
  @ApiOkResponse({
    description: 'List of custom roles',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          permissions: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, subject: { type: 'string' } } } },
        },
      },
    },
  })
  async listRoles() {
    return this.listRolesHandler.execute();
  }

  @Post('roles')
  @CheckPermissions({ action: 'manage', subject: 'Role' })
  @RequireFeature(FeatureKey.CUSTOM_ROLES)
  @ApiOperation({ summary: 'Create a custom role' })
  @ApiCreatedResponse({
    description: 'Role created',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        organizationId: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async createRoleEndpoint(@Body() body: CreateRoleDto) {
    return this.createRoleHandler.execute(body);
  }

  @Post('roles/:id/permissions')
  @CheckPermissions({ action: 'manage', subject: 'Role' })
  @RequireFeature(FeatureKey.CUSTOM_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign permissions to a role' })
  @ApiParam({ name: 'id', description: 'Role UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Permissions assigned' })
  @ApiResponse({ status: 404, description: 'Role not found', type: ApiErrorDto })
  async assignPermissionsEndpoint(
    @Param('id', ParseUUIDPipe) customRoleId: string,
    @Body() body: AssignPermissionsDto,
  ) {
    await this.assignPermissionsHandler.execute({ ...body, customRoleId });
  }

  @Get('permissions')
  @CheckPermissions({ action: 'read', subject: 'Role' })
  @ApiOperation({ summary: 'List available permissions' })
  @ApiOkResponse({
    description: 'All available CASL permissions',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', example: 'create' },
          subject: { type: 'string', example: 'Booking' },
        },
      },
    },
  })
  async listPermissions() {
    return this.listPermissionsHandler.execute();
  }

  @Delete('roles/:id')
  @CheckPermissions({ action: 'manage', subject: 'Role' })
  @RequireFeature(FeatureKey.CUSTOM_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom role' })
  @ApiParam({ name: 'id', description: 'Role UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Role deleted' })
  @ApiResponse({ status: 404, description: 'Role not found', type: ApiErrorDto })
  async deleteRoleEndpoint(@Param('id', ParseUUIDPipe) customRoleId: string) {
    await this.deleteRoleHandler.execute({ customRoleId });
  }
}
