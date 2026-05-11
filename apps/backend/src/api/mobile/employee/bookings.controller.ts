import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CancellationReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiStandardResponses } from '../../../common/swagger';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../../common/guards/casl.guard';
import { CurrentUser, JwtUser } from '../../../common/auth/current-user.decorator';
import { PrismaService } from '../../../infrastructure/database';
import { ListBookingsHandler } from '../../../modules/bookings/list-bookings/list-bookings.handler';
import { ListBookingsDto } from '../../../modules/bookings/list-bookings/list-bookings.dto';
import { GetBookingHandler } from '../../../modules/bookings/get-booking/get-booking.handler';
import { CheckInBookingHandler } from '../../../modules/bookings/check-in-booking/check-in-booking.handler';
import { CompleteBookingHandler } from '../../../modules/bookings/complete-booking/complete-booking.handler';
import { CompleteBookingDto } from '../../../modules/bookings/complete-booking/complete-booking.dto';
import { CancelBookingHandler } from '../../../modules/bookings/cancel-booking/cancel-booking.handler';
import { RequestCancelBookingHandler } from '../../../modules/bookings/request-cancel-booking/request-cancel-booking.handler';
import { CreateEmployeeBookingHandler } from '../../../modules/bookings/create-employee-booking/create-employee-booking.handler';
import { CreateEmployeeBookingDto } from '../../../modules/bookings/create-employee-booking/create-employee-booking.dto';

export class EmployeeCancelBookingDto {
  @ApiPropertyOptional({
    description: 'Cancellation reason',
    enum: CancellationReason,
    enumName: 'CancellationReason',
    example: CancellationReason.EMPLOYEE_UNAVAILABLE,
  })
  @IsOptional()
  @IsEnum(CancellationReason)
  reason?: CancellationReason;

  @ApiPropertyOptional({ description: 'Free-text notes about the cancellation', example: 'Emergency leave' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelNotes?: string;
}

export class EmployeeCancelRequestDto {
  @ApiPropertyOptional({
    description: 'Cancellation reason',
    enum: CancellationReason,
    enumName: 'CancellationReason',
    example: CancellationReason.EMPLOYEE_UNAVAILABLE,
  })
  @IsOptional()
  @IsEnum(CancellationReason)
  reason?: CancellationReason;

  @ApiPropertyOptional({ description: 'Free-text notes about the cancellation request', example: 'Need to reschedule' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelNotes?: string;
}

@ApiTags('Mobile Employee / Bookings')
@ApiBearerAuth()
@ApiStandardResponses()
@UseGuards(JwtGuard, CaslGuard)
@Controller('mobile/employee/bookings')
export class MobileEmployeeBookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listHandler: ListBookingsHandler,
    private readonly getHandler: GetBookingHandler,
    private readonly checkInHandler: CheckInBookingHandler,
    private readonly completeHandler: CompleteBookingHandler,
    private readonly cancelHandler: CancelBookingHandler,
    private readonly requestCancelHandler: RequestCancelBookingHandler,
    private readonly createEmployeeHandler: CreateEmployeeBookingHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPermissions({ action: 'create', subject: 'Booking' })
  @ApiOperation({ summary: 'Create a new booking on the authenticated employee calendar' })
  @ApiCreatedResponse({ description: 'Booking created', schema: { type: 'object' } })
  createMyBooking(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEmployeeBookingDto,
  ) {
    return this.createEmployeeHandler.execute({
      ...dto,
      employeeId: user.sub,
    });
  }

  @Get()
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @ApiOperation({ summary: 'List bookings assigned to the authenticated employee' })
  @ApiOkResponse({ description: 'Paginated list of bookings', schema: { type: 'object' } })
  listMyBookings(@CurrentUser() user: JwtUser, @Query() q: ListBookingsDto) {
    const { page, limit, fromDate, toDate, ...rest } = q;
    return this.listHandler.execute({
      ...rest,
      employeeId: user.sub,
      page: page ?? 1,
      limit: limit ?? 20,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });
  }

  @Get(':id')
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @ApiOperation({ summary: 'Get a booking assigned to the authenticated employee' })
  @ApiParam({ name: 'id', description: 'Booking ID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Booking detail', schema: { type: 'object' } })
  async getBooking(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertOwnership(id, user.sub);
    return this.getHandler.execute({ bookingId: id });
  }

  @Post(':id/start')
  @CheckPermissions({ action: 'update', subject: 'Booking' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the session for an assigned booking (check-in)' })
  @ApiParam({ name: 'id', description: 'Booking ID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Booking marked as started', schema: { type: 'object' } })
  async start(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertOwnership(id, user.sub);
    return this.checkInHandler.execute({ bookingId: id, changedBy: user.sub });
  }

  @Post(':id/complete')
  @CheckPermissions({ action: 'update', subject: 'Booking' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an assigned booking as complete' })
  @ApiParam({ name: 'id', description: 'Booking ID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Booking marked complete', schema: { type: 'object' } })
  async complete(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteBookingDto,
  ) {
    await this.assertOwnership(id, user.sub);
    return this.completeHandler.execute({
      bookingId: id,
      changedBy: user.sub,
      ...body,
    });
  }

  @Post(':id/employee-cancel')
  @CheckPermissions({ action: 'delete', subject: 'Booking' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an assigned booking (employee-initiated, immediate)' })
  @ApiParam({ name: 'id', description: 'Booking ID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Booking cancelled', schema: { type: 'object' } })
  async employeeCancel(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmployeeCancelBookingDto,
  ) {
    await this.assertOwnership(id, user.sub);
    return this.cancelHandler.execute({
      bookingId: id,
      changedBy: user.sub,
      reason: body.reason ?? CancellationReason.EMPLOYEE_UNAVAILABLE,
      cancelNotes: body.cancelNotes,
      source: 'employee',
    });
  }

  @Post(':id/cancel-request')
  @CheckPermissions({ action: 'update', subject: 'Booking' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request cancellation for an assigned booking (requires admin approval)' })
  @ApiParam({ name: 'id', description: 'Booking ID', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOkResponse({ description: 'Cancellation request submitted', schema: { type: 'object' } })
  async cancelRequest(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmployeeCancelRequestDto,
  ) {
    await this.assertOwnership(id, user.sub);
    return this.requestCancelHandler.execute({
      bookingId: id,
      reason: body.reason ?? CancellationReason.EMPLOYEE_UNAVAILABLE,
      cancelNotes: body.cancelNotes,
      requestedBy: user.sub,
    });
  }

  /**
   * Confirms the booking exists and is assigned to the calling employee.
   * Throws NotFoundException if the booking is missing, ForbiddenException if it belongs
   * to a different employee.
   */
  private async assertOwnership(bookingId: string, employeeId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId },
      select: { id: true, employeeId: true },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }
    if (booking.employeeId !== employeeId) {
      throw new ForbiddenException('Booking is not assigned to you');
    }
  }
}
