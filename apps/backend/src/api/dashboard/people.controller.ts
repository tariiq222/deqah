import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, BadRequestException, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiConsumes, ApiBody,
  ApiNotFoundResponse, ApiExtraModels, getSchemaPath,
} from '@nestjs/swagger';
import { ApiStandardResponses } from '../../common/swagger';
import {
  ClientResponseDto, EmployeeResponseDto,
  PaginatedClientsDto, PaginatedEmployeesDto,
  EmployeeStatsResponseDto, SetClientActiveResponseDto,
  UploadAvatarResponseDto,
} from './dto/people-response.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { CreateClientHandler } from '../../modules/people/clients/create-client.handler';
import { UpdateClientHandler } from '../../modules/people/clients/update-client.handler';
import { ListClientsHandler } from '../../modules/people/clients/list-clients.handler';
import { GetClientHandler } from '../../modules/people/clients/get-client.handler';
import { DeleteClientHandler } from '../../modules/people/clients/delete-client.handler';
import { SetClientActiveHandler } from '../../modules/people/clients/set-client-active/set-client-active.handler';
import { SetClientActiveDto } from '../../modules/people/clients/set-client-active/set-client-active.dto';
import { CreateClientDto } from '../../modules/people/clients/create-client.dto';
import { UpdateClientDto } from '../../modules/people/clients/update-client.dto';
import { ListClientsDto } from '../../modules/people/clients/list-clients.dto';
import { CreateEmployeeHandler } from '../../modules/people/employees/create-employee.handler';
import { ListEmployeesHandler } from '../../modules/people/employees/list-employees.handler';
import { GetEmployeeHandler } from '../../modules/people/employees/get-employee.handler';
import { UpdateAvailabilityHandler } from '../../modules/people/employees/update-availability.handler';
import { EmployeeOnboardingHandler } from '../../modules/people/employees/employee-onboarding.handler';
import { OnboardEmployeeHandler } from '../../modules/people/employees/onboard-employee.handler';
import { OnboardEmployeeDto } from '../../modules/people/employees/onboard-employee.dto';
import { GetAvailabilityHandler } from '../../modules/people/employees/get-availability.handler';
import { UpdateEmployeeHandler } from '../../modules/people/employees/update-employee.handler';
import { UpdateEmployeeDto } from '../../modules/people/employees/update-employee.dto';
import { CreateEmployeeDto } from '../../modules/people/employees/create-employee.dto';
import { ListEmployeesDto } from '../../modules/people/employees/list-employees.dto';
import { UpdateAvailabilityDto } from '../../modules/people/employees/update-availability.dto';
import { EmployeeOnboardingDto } from '../../modules/people/employees/employee-onboarding.dto';
import { DeleteEmployeeHandler } from '../../modules/people/employees/delete-employee.handler';
import { ListEmployeeServicesHandler } from '../../modules/people/employees/list-employee-services.handler';
import { GetEmployeeServiceTypesHandler } from '../../modules/people/employees/get-employee-service-types.handler';
import { CheckAvailabilityHandler } from '../../modules/bookings/check-availability/check-availability.handler';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { AssignEmployeeServiceHandler } from '../../modules/people/employees/assign-employee-service.handler';
import { RemoveEmployeeServiceHandler } from '../../modules/people/employees/remove-employee-service.handler';
import { EnforceLimit } from '../../modules/platform/billing/plan-limits.decorator';
import { TrackUsage } from '../../modules/platform/billing/track-usage.decorator';
import { ListEmployeeExceptionsHandler } from '../../modules/people/employees/list-employee-exceptions.handler';
import { CreateEmployeeExceptionHandler } from '../../modules/people/employees/create-employee-exception.handler';
import { CreateEmployeeExceptionDto } from '../../modules/people/employees/create-employee-exception.dto';
import { DeleteEmployeeExceptionHandler } from '../../modules/people/employees/delete-employee-exception.handler';
import { ListEmployeeRatingsHandler } from '../../modules/people/employees/list-employee-ratings.handler';
import { EmployeeStatsHandler } from '../../modules/people/employees/employee-stats.handler';
import { GetEmployeeBreaksHandler } from '../../modules/people/employees/get-employee-breaks/get-employee-breaks.handler';
import { SetEmployeeBreaksHandler } from '../../modules/people/employees/set-employee-breaks/set-employee-breaks.handler';
import { SetEmployeeBreaksDto } from '../../modules/people/employees/set-employee-breaks/set-employee-breaks.dto';
import { UploadAvatarHandler } from '../../modules/people/employees/upload-avatar/upload-avatar.handler';
import { AttachMembershipHandler } from '../../modules/identity/attach-membership/attach-membership.handler';
import { AttachMembershipDto } from '../../modules/identity/attach-membership/attach-membership.dto';
import { PaginationDto } from '../../common/dto';

class EmployeeSlotsQuery {
  @IsDateString() date!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) duration?: number;
}

function formatHHmm(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

@ApiTags('Dashboard / People')
@ApiBearerAuth()
@ApiStandardResponses()
@ApiExtraModels(
  ClientResponseDto, EmployeeResponseDto,
  PaginatedClientsDto, PaginatedEmployeesDto,
  EmployeeStatsResponseDto, SetClientActiveResponseDto,
  UploadAvatarResponseDto,
)
@Controller('dashboard/people')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardPeopleController {
  constructor(
    private readonly createClient: CreateClientHandler,
    private readonly updateClient: UpdateClientHandler,
    private readonly listClients: ListClientsHandler,
    private readonly getClient: GetClientHandler,
    private readonly deleteClient: DeleteClientHandler,
    private readonly setClientActive: SetClientActiveHandler,
    private readonly createEmployee: CreateEmployeeHandler,
    private readonly listEmployees: ListEmployeesHandler,
    private readonly getEmployee: GetEmployeeHandler,
    private readonly updateAvailability: UpdateAvailabilityHandler,
    private readonly employeeOnboarding: EmployeeOnboardingHandler,
    private readonly onboardEmployee: OnboardEmployeeHandler,
    private readonly getAvailability: GetAvailabilityHandler,
    private readonly updateEmployee: UpdateEmployeeHandler,
    private readonly deleteEmployee: DeleteEmployeeHandler,
    private readonly listEmployeeServices: ListEmployeeServicesHandler,
    private readonly getEmployeeServiceTypes: GetEmployeeServiceTypesHandler,
    private readonly checkAvailability: CheckAvailabilityHandler,
    private readonly assignEmployeeService: AssignEmployeeServiceHandler,
    private readonly removeEmployeeService: RemoveEmployeeServiceHandler,
    private readonly listEmployeeExceptions: ListEmployeeExceptionsHandler,
    private readonly createEmployeeException: CreateEmployeeExceptionHandler,
    private readonly deleteEmployeeException: DeleteEmployeeExceptionHandler,
    private readonly listEmployeeRatings: ListEmployeeRatingsHandler,
    private readonly employeeStats: EmployeeStatsHandler,
    private readonly uploadAvatar: UploadAvatarHandler,
    private readonly attachMembership: AttachMembershipHandler,
    private readonly getEmployeeBreaks: GetEmployeeBreaksHandler,
    private readonly setEmployeeBreaks: SetEmployeeBreaksHandler,
  ) {}
  // ── Clients ────────────────────────────────────────────────────────────────
  @Post('clients')
  @CheckPermissions({ action: 'create', subject: 'Client' })
  @HttpCode(HttpStatus.CREATED)
  @TrackUsage('CLIENTS')
  @ApiOperation({ summary: 'Create a client' })
  @ApiCreatedResponse({ type: ClientResponseDto, description: 'Client created' })
  createClientEndpoint(@Body() body: CreateClientDto) {
    return this.createClient.execute(body);
  }

  @Get('clients')
  @CheckPermissions({ action: 'read', subject: 'Client' })
  @ApiOperation({ summary: 'List clients' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or phone', example: 'Sara' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'gender', required: false, description: 'Filter by gender', example: 'FEMALE' })
  @ApiQuery({ name: 'source', required: false, description: 'Filter by acquisition source', example: 'REFERRAL' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page', example: 20 })
  @ApiOkResponse({ type: PaginatedClientsDto, description: 'Paginated list of clients' })
  listClientsEndpoint(
    @Query() query: ListClientsDto,
    @Query('isActive') rawIsActive?: string,
  ) {
    // Global ValidationPipe has enableImplicitConversion: true, which runs
    // Boolean(string) against query params — making any non-empty string truthy
    // (so "false" becomes true). Parse the raw value explicitly instead.
    const isActive =
      rawIsActive === 'true' ? true : rawIsActive === 'false' ? false : undefined;
    return this.listClients.execute({
      ...query,
      isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get('clients/:id')
  @CheckPermissions({ action: 'read', subject: 'Client' })
  @ApiOperation({ summary: 'Get a client by ID' })
  @ApiParam({ name: 'id', description: 'Client UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ type: ClientResponseDto, description: 'Client record' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  getClientEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.getClient.execute({ clientId: id });
  }

  @Patch('clients/:id')
  @CheckPermissions({ action: 'update', subject: 'Client' })
  @ApiOperation({ summary: 'Update a client' })
  @ApiParam({ name: 'id', description: 'Client UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ type: ClientResponseDto, description: 'Updated client record' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  updateClientEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClientDto,
  ) {
    return this.updateClient.execute({ clientId: id, ...body });
  }

  @Delete('clients/:id')
  @CheckPermissions({ action: 'delete', subject: 'Client' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a client' })
  @ApiParam({ name: 'id', description: 'Client UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Client deleted' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async deleteClientEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    await this.deleteClient.execute({ clientId: id });
  }

  @Patch('clients/:id/active')
  @CheckPermissions({ action: 'update', subject: 'Client' })
  @ApiOperation({ summary: 'Enable or disable a client account' })
  @ApiParam({ name: 'id', description: 'Client UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiBody({ type: SetClientActiveDto })
  @ApiOkResponse({ type: SetClientActiveResponseDto, description: 'Client account status updated' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  setClientActiveEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetClientActiveDto,
    @Request() req: { user?: { id?: string } },
  ) {
    return this.setClientActive.execute({
      clientId: id,
      isActive: body.isActive,
      reason: body.reason,
      actorUserId: req.user?.id,
    });
  }
  // ── Employees ──────────────────────────────────────────────────────────────
  @Post('employees')
  @CheckPermissions({ action: 'create', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @EnforceLimit('EMPLOYEES')
  @ApiOperation({ summary: 'Create an employee' })
  @ApiCreatedResponse({ type: EmployeeResponseDto, description: 'Employee created' })
  createEmployeeEndpoint(@Body() body: CreateEmployeeDto) {
    return this.createEmployee.execute(body);
  }

  @Post('employees/onboarding')
  @CheckPermissions({ action: 'create', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @EnforceLimit('EMPLOYEES')
  @ApiOperation({ summary: 'Onboard a new employee with full profile details' })
  @ApiCreatedResponse({
    description: 'Employee onboarded',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Employee onboarded successfully' },
        employee: { $ref: getSchemaPath(EmployeeResponseDto) },
      },
    },
  })
  onboardEmployeeEndpoint(@Body() body: OnboardEmployeeDto) {
    return this.onboardEmployee.execute(body);
  }

  @Post('employees/attach-membership')
  @CheckPermissions({ action: 'create', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @EnforceLimit('EMPLOYEES')
  @ApiOperation({ summary: 'Attach an existing user as an employee to the organization' })
  @ApiCreatedResponse({
    description: 'Membership created',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Membership UUID' },
        userId: { type: 'string', format: 'uuid' },
        organizationId: { type: 'string', format: 'uuid' },
        role: { type: 'string', example: 'EMPLOYEE' },
        isActive: { type: 'boolean', example: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  attachMembershipEndpoint(@Body() body: AttachMembershipDto) {
    return this.attachMembership.execute(body);
  }

  @Get('employees')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: 'List employees' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, email, or phone', example: 'Khalid' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'gender', required: false, description: 'Filter by gender', example: 'MALE' })
  @ApiQuery({ name: 'employmentType', required: false, description: 'Filter by employment type', example: 'FULL_TIME' })
  @ApiQuery({ name: 'onboardingStatus', required: false, description: 'Filter by onboarding status', example: 'COMPLETE' })
  @ApiQuery({ name: 'branchId', required: false, description: 'Filter by branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page', example: 20 })
  @ApiOkResponse({ type: PaginatedEmployeesDto, description: 'Paginated list of employees' })
  listEmployeesEndpoint(
    @Query() query: ListEmployeesDto,
    @Query('isActive') rawIsActive?: string,
  ) {
    // Global ValidationPipe has enableImplicitConversion: true, which runs
    // Boolean(string) against query params — making any non-empty string truthy
    // (so "false" becomes true). Parse the raw value explicitly instead.
    const isActive =
      rawIsActive === 'true' ? true : rawIsActive === 'false' ? false : undefined;
    return this.listEmployees.execute({
      ...query,
      isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get('employees/stats')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: 'Get employee statistics' })
  @ApiOkResponse({ type: EmployeeStatsResponseDto, description: 'Employee statistics summary' })
  employeeStatsEndpoint() {
    return this.employeeStats.execute();
  }

  @Get('employees/:id')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: 'Get an employee by ID' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ type: EmployeeResponseDto, description: 'Employee record' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  getEmployeeEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.getEmployee.execute({ employeeId: id });
  }

  @Patch('employees/:id')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @ApiOperation({ summary: 'Update an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ type: EmployeeResponseDto, description: 'Updated employee record' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  updateEmployeeEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEmployeeDto,
  ) {
    return this.updateEmployee.execute({ employeeId: id, ...body });
  }

  @Get('employees/:id/availability')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: "Get an employee's availability schedule" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'Availability windows and exceptions',
    schema: {
      type: 'object',
      properties: {
        schedule: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, example: 1 },
              startTime: { type: 'string', example: '09:00' },
              endTime: { type: 'string', example: '17:00' },
              isActive: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  getAvailabilityEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.getAvailability.execute({ employeeId: id });
  }

  @Get('employees/:id/breaks')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: "Get an employee's break schedule" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'Break windows for the employee',
    schema: {
      type: 'object',
      properties: {
        breaks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, example: 1 },
              startTime: { type: 'string', example: '13:00' },
              endTime: { type: 'string', example: '14:00' },
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  getBreaksEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.getEmployeeBreaks.execute({ employeeId: id });
  }

  @Put('employees/:id/breaks')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set an employee's break schedule" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'Updated break windows',
    schema: {
      type: 'object',
      properties: {
        breaks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, example: 1 },
              startTime: { type: 'string', example: '13:00' },
              endTime: { type: 'string', example: '14:00' },
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  putBreaksEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetEmployeeBreaksDto,
  ) {
    return this.setEmployeeBreaks.execute({ employeeId: id, ...body });
  }

  @Get('employees/:id/vacations')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: "List an employee's vacations (exceptions)" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'List of vacation/exception records',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          reason: { type: 'string', nullable: true },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  listVacationsEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.listEmployeeExceptions.execute({ employeeId: id });
  }

  @Post('employees/:id/vacations')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a vacation exception for an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiCreatedResponse({
    description: 'Vacation created',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        employeeId: { type: 'string', format: 'uuid' },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        reason: { type: 'string', nullable: true },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  createVacationEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateEmployeeExceptionDto,
  ) {
    return this.createEmployeeException.execute({ employeeId: id, ...body });
  }

  @Delete('employees/:id/vacations/:vacationId')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a vacation exception' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiParam({ name: 'vacationId', description: 'Vacation exception UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Vacation deleted' })
  @ApiNotFoundResponse({ description: 'Employee or vacation not found' })
  deleteVacationEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vacationId', ParseUUIDPipe) vacationId: string,
  ) {
    return this.deleteEmployeeException.execute({ employeeId: id, exceptionId: vacationId });
  }

  @Patch('employees/:id/availability')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @ApiOperation({ summary: "Update an employee's availability windows and exceptions" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'Updated availability windows and exceptions',
    schema: {
      type: 'object',
      properties: {
        windows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
              startTime: { type: 'string', example: '09:00' },
              endTime: { type: 'string', example: '17:00' },
              isActive: { type: 'boolean' },
            },
          },
        },
        exceptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              startDate: { type: 'string', format: 'date-time' },
              endDate: { type: 'string', format: 'date-time' },
              reason: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  updateAvailabilityEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAvailabilityDto,
  ) {
    return this.updateAvailability.execute({
      employeeId: id,
      windows: body.windows,
      exceptions: body.exceptions,
    });
  }

  @Post('employees/:id/onboarding')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an onboarding step for an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ type: EmployeeResponseDto, description: 'Onboarding step processed — returns updated employee' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  employeeOnboardingEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmployeeOnboardingDto,
  ) {
    return this.employeeOnboarding.execute({ employeeId: id, ...body });
  }

  @Delete('employees/:id')
  @CheckPermissions({ action: 'delete', subject: 'Employee' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Employee deleted' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  deleteEmployeeEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteEmployee.execute({ employeeId: id });
  }

  @Get('employees/:id/services')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: "List services assigned to an employee" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'List of assigned services with service details',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'EmployeeService link UUID' },
          employeeId: { type: 'string', format: 'uuid' },
          serviceId: { type: 'string', format: 'uuid' },
          service: {
            type: 'object', nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Family Therapy Session' },
              price: { type: 'number', example: 300 },
              isActive: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  listEmployeeServicesEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.listEmployeeServices.execute({ employeeId: id });
  }

  @Post('employees/:id/services')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a service to an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['serviceId'],
      properties: { serviceId: { type: 'string', format: 'uuid', description: 'Service UUID to assign' } },
    },
  })
  @ApiCreatedResponse({
    description: 'Service assigned',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        employeeId: { type: 'string', format: 'uuid' },
        serviceId: { type: 'string', format: 'uuid' },
        organizationId: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  assignEmployeeServiceEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { serviceId: string },
  ) {
    return this.assignEmployeeService.execute({ employeeId: id, serviceId: body.serviceId });
  }

  @Get('employees/:id/slots')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: 'Available booking slots for an employee on a given date' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiQuery({ name: 'date', description: 'Date (ISO 8601, YYYY-MM-DD)', example: '2026-05-01' })
  @ApiQuery({ name: 'duration', description: 'Slot duration in minutes', required: false, example: 30 })
  @ApiOkResponse({
    description: 'Available slots',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startTime: { type: 'string', example: '09:00', description: 'HH:MM UTC' },
          endTime: { type: 'string', example: '09:30', description: 'HH:MM UTC' },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  async getEmployeeSlotsEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: EmployeeSlotsQuery,
  ) {
    const mainBranch = 'main-branch';
    const slots = await this.checkAvailability.execute({
      employeeId: id,
      branchId: mainBranch,
      date: new Date(q.date),
      durationMins: q.duration,
    });
    return slots.map((s) => ({
      startTime: formatHHmm(s.startTime),
      endTime: formatHHmm(s.endTime),
    }));
  }

  @Get('employees/:id/services/:serviceId/types')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: 'Get bookable types + duration options for an employee-service pair' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'Bookable types with duration options',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'link-uuid:IN_PERSON' },
          employeeServiceId: { type: 'string', format: 'uuid' },
          bookingType: { type: 'string', example: 'in_person' },
          price: { type: 'number', example: 300 },
          duration: { type: 'integer', example: 60 },
          useCustomOptions: { type: 'boolean' },
          isActive: { type: 'boolean' },
          durationOptions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                label: { type: 'string', nullable: true },
                durationMinutes: { type: 'integer', example: 60 },
                price: { type: 'number', example: 300 },
                isDefault: { type: 'boolean' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee-service link not found' })
  getEmployeeServiceTypesEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    return this.getEmployeeServiceTypes.execute({ employeeId: id, serviceId });
  }

  @Delete('employees/:id/services/:serviceId')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a service from an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiParam({ name: 'serviceId', description: 'Service UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Service removed' })
  @ApiNotFoundResponse({ description: 'Employee or service not found' })
  removeEmployeeServiceEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    return this.removeEmployeeService.execute({ employeeId: id, serviceId });
  }

  @Get('employees/:id/exceptions')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: "List availability exceptions for an employee" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({
    description: 'List of availability exceptions',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          employeeId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          reason: { type: 'string', nullable: true },
          isStartTimeOnly: { type: 'boolean' },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  listEmployeeExceptionsEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    return this.listEmployeeExceptions.execute({ employeeId: id });
  }

  @Post('employees/:id/exceptions')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an availability exception for an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiCreatedResponse({
    description: 'Exception created',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        employeeId: { type: 'string', format: 'uuid' },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        reason: { type: 'string', nullable: true },
        isStartTimeOnly: { type: 'boolean' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  createEmployeeExceptionEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateEmployeeExceptionDto,
  ) {
    return this.createEmployeeException.execute({ employeeId: id, ...body });
  }

  @Delete('employees/:id/exceptions/:exceptionId')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an availability exception' })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiParam({ name: 'exceptionId', description: 'Exception UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Exception deleted' })
  @ApiNotFoundResponse({ description: 'Employee or exception not found' })
  deleteEmployeeExceptionEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
  ) {
    return this.deleteEmployeeException.execute({ employeeId: id, exceptionId });
  }

  @Get('employees/:id/ratings')
  @CheckPermissions({ action: 'read', subject: 'Employee' })
  @ApiOperation({ summary: "List ratings for an employee" })
  @ApiParam({ name: 'id', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Results per page', example: 20 })
  @ApiOkResponse({
    description: 'Paginated list of employee ratings',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              employeeId: { type: 'string', format: 'uuid' },
              score: { type: 'number', minimum: 1, maximum: 5, example: 5 },
              comment: { type: 'string', nullable: true },
              isPublic: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            perPage: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPreviousPage: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  listEmployeeRatingsEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationDto,
  ) {
    return this.listEmployeeRatings.execute({ employeeId: id, ...query });
  }

  @Post('employees/:employeeId/avatar')
  @CheckPermissions({ action: 'update', subject: 'Employee' })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an avatar image for an employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Avatar image (JPEG/PNG/WebP)' },
      },
    },
  })
  @ApiCreatedResponse({ type: UploadAvatarResponseDto, description: 'Avatar uploaded — returns fileId and URL' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  uploadAvatarEndpoint(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadAvatar.execute({
      employeeId,
      filename: file.originalname, mimetype: file.mimetype, size: file.size,
    }, file.buffer);
  }
}
