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
import { CalendarEventsService } from './calendar-events.service';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  ListCalendarEventsQueryDto,
} from './dto/calendar-event.dto';

// Blocs d'agenda libres (pause, réunion, blocage de créneau...) sans lien
// avec un dossier patient — voir le commentaire sur le modèle CalendarEvent
// dans schema.prisma. Accès partagé admin+médecin comme pour les
// rendez-vous (pas de @Roles ici), aucune restriction ajoutée.
@ApiTags('Agenda — Événements')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private calendarEventsService: CalendarEventsService) {}

  @Post()
  @ApiOperation({ summary: "Créer un événement d'agenda sans patient" })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateCalendarEventDto) {
    return this.calendarEventsService.create(user.cabinetId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister les événements d'agenda (avec filtres de dates)" })
  findAll(@CurrentUser() user: CurrentUserType, @Query() query: ListCalendarEventsQueryDto) {
    return this.calendarEventsService.findAll(user.cabinetId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.calendarEventsService.findOne(user.cabinetId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarEventsService.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.calendarEventsService.delete(user.cabinetId, id);
  }
}
