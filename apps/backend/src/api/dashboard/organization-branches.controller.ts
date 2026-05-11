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
import { ApiStandardResponses, ApiErrorDto } from '../../common/swagger';
import { EnforceLimit } from '../../modules/platform/billing/plan-limits.decorator';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { CreateBranchHandler } from '../../modules/org-config/branches/create-branch.handler';
import { CreateBranchDto } from '../../modules/org-config/branches/create-branch.dto';
import { UpdateBranchHandler } from '../../modules/org-config/branches/update-branch.handler';
import { UpdateBranchDto } from '../../modules/org-config/branches/update-branch.dto';
import { ListBranchesHandler } from '../../modules/org-config/branches/list-branches.handler';
import { ListBranchesDto } from '../../modules/org-config/branches/list-branches.dto';
import { GetBranchHandler } from '../../modules/org-config/branches/get-branch.handler';
import { DeleteBranchHandler } from '../../modules/org-config/branches/delete-branch.handler';
import { ListBranchEmployeesHandler } from '../../modules/org-config/branches/list-branch-employees.handler';
import { AssignEmployeeToBranchHandler } from '../../modules/org-config/branches/assign-employee-to-branch.handler';
import { AssignEmployeeToBranchDto } from '../../modules/org-config/branches/assign-employee-to-branch.dto';
import { UnassignEmployeeFromBranchHandler } from '../../modules/org-config/branches/unassign-employee-from-branch.handler';

@ApiTags('Dashboard / Org Config')
@ApiBearerAuth()
@ApiStandardResponses()
@UseGuards(JwtGuard, CaslGuard)
@Controller('dashboard/organization')
export class DashboardOrganizationBranchesController {
  constructor(
    private readonly createBranch: CreateBranchHandler,
    private readonly updateBranch: UpdateBranchHandler,
    private readonly listBranches: ListBranchesHandler,
    private readonly getBranch: GetBranchHandler,
    private readonly deleteBranch: DeleteBranchHandler,
    private readonly listBranchEmployees: ListBranchEmployeesHandler,
    private readonly assignEmployee: AssignEmployeeToBranchHandler,
    private readonly unassignEmployee: UnassignEmployeeFromBranchHandler,
  ) {}

  @Post('branches')
  @CheckPermissions({ action: 'create', subject: 'Branch' })
  @RequireFeature(FeatureKey.MULTI_BRANCH)
  @EnforceLimit('BRANCHES')
  @ApiOperation({ summary: 'Create a branch' })
  @ApiCreatedResponse({ description: 'Branch created' })
  createBranchEndpoint(@Body() body: CreateBranchDto) {
    return this.createBranch.execute(body);
  }

  @Get('branches')
  @CheckPermissions({ action: 'read', subject: 'Branch' })
  @ApiOperation({ summary: 'List branches' })
  @ApiQuery({ name: 'search', required: false, description: 'Search branches by name or city', example: 'Riyadh' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status', example: true })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page', example: 20 })
  @ApiOkResponse({ description: 'Paginated list of branches' })
  listBranchesEndpoint(@Query() query: ListBranchesDto) {
    return this.listBranches.execute(query);
  }

  @Get('branches/:branchId')
  @CheckPermissions({ action: 'read', subject: 'Branch' })
  @ApiOperation({ summary: 'Get a branch by ID' })
  @ApiParam({ name: 'branchId', description: 'Branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Branch details' })
  @ApiResponse({ status: 404, description: 'Branch not found', type: ApiErrorDto })
  getBranchEndpoint(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.getBranch.execute({ branchId });
  }

  @Patch('branches/:branchId')
  @CheckPermissions({ action: 'update', subject: 'Branch' })
  @RequireFeature(FeatureKey.MULTI_BRANCH)
  @ApiOperation({ summary: 'Update a branch' })
  @ApiParam({ name: 'branchId', description: 'Branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Branch updated' })
  @ApiResponse({ status: 404, description: 'Branch not found', type: ApiErrorDto })
  updateBranchEndpoint(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: UpdateBranchDto,
  ) {
    return this.updateBranch.execute({ branchId, ...body });
  }

  @Delete('branches/:branchId')
  @CheckPermissions({ action: 'delete', subject: 'Branch' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a branch' })
  @ApiParam({ name: 'branchId', description: 'Branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Branch deleted' })
  @ApiResponse({ status: 404, description: 'Branch not found', type: ApiErrorDto })
  deleteBranchEndpoint(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.deleteBranch.execute({ branchId });
  }

  @Get('branches/:branchId/employees')
  @CheckPermissions({ action: 'read', subject: 'Branch' })
  @ApiOperation({ summary: 'List employees assigned to a branch' })
  @ApiParam({ name: 'branchId', description: 'Branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'List of employees in the branch' })
  @ApiResponse({ status: 404, description: 'Branch not found', type: ApiErrorDto })
  listBranchEmployeesEndpoint(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.listBranchEmployees.execute({ branchId });
  }

  @Post('branches/:branchId/employees')
  @CheckPermissions({ action: 'update', subject: 'Branch' })
  @ApiOperation({ summary: 'Assign an employee to a branch' })
  @ApiParam({ name: 'branchId', description: 'Branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiCreatedResponse({ description: 'Employee assigned to branch' })
  @ApiResponse({ status: 404, description: 'Branch or employee not found', type: ApiErrorDto })
  assignEmployeeEndpoint(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: AssignEmployeeToBranchDto,
  ) {
    return this.assignEmployee.execute({ branchId, ...body });
  }

  @Delete('branches/:branchId/employees/:employeeId')
  @CheckPermissions({ action: 'update', subject: 'Branch' })
  @ApiOperation({ summary: 'Unassign an employee from a branch' })
  @ApiParam({ name: 'branchId', description: 'Branch UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiNoContentResponse({ description: 'Employee unassigned from branch' })
  @ApiResponse({ status: 404, description: 'Branch or employee not found', type: ApiErrorDto })
  unassignEmployeeEndpoint(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.unassignEmployee.execute({ branchId, employeeId });
  }
}
