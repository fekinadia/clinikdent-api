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
import { RemindersService } from './reminders.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';

@ApiTags('Reminders')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private remindersService: RemindersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un rappel manuel pour un patient' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(user.cabinetId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les rappels manuels (par patient ou tous ceux en cours du cabinet)' })
  findAll(
    @CurrentUser() user: CurrentUserType,
    @Query('patientId') patientId?: string,
    @Query('includeDone') includeDone?: string,
  ) {
    return this.remindersService.findAll(
      user.cabinetId,
      patientId ? Number(patientId) : undefined,
      includeDone === 'true',
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un rappel (marquer comme fait, changer la date ou la note)' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un rappel' })
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.remindersService.delete(user.cabinetId, id);
  }
}
