import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { AppointmentRemindersService } from './appointment-reminders.service';

@ApiTags('Appointment Reminders')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('appointment-reminders')
export class AppointmentRemindersController {
  constructor(private appointmentRemindersService: AppointmentRemindersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les rappels de RDV programmés/envoyés du cabinet' })
  findAll(@CurrentUser() user: CurrentUserType, @Query('statut') statut?: string) {
    return this.appointmentRemindersService.findAll(user.cabinetId, statut);
  }
}
