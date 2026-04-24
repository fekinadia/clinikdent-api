import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  ListAppointmentsQueryDto,
} from './dto/appointment.dto';

@ApiTags('Rendez-vous')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un rendez-vous (avec détection de conflits)' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(user.cabinetId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les rendez-vous (avec filtres)' })
  findAll(@CurrentUser() user: CurrentUserType, @Query() query: ListAppointmentsQueryDto) {
    return this.appointmentsService.findAll(user.cabinetId, query);
  }

  @Get('today')
  @ApiOperation({ summary: "Rendez-vous du jour" })
  today(@CurrentUser() user: CurrentUserType) {
    return this.appointmentsService.findToday(user.cabinetId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.findOne(user.cabinetId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.delete(user.cabinetId, id);
  }
}
