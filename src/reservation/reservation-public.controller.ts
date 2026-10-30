import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IpThrottlerGuard } from '../auth/ip-throttler.guard';
import { CreerDemandeDto, CreneauxQueryDto } from './dto/reservation.dto';
import { ReservationService } from './reservation.service';

// Seules routes de l'API accessibles sans compte, avec /auth/login. Elles
// donnent les créneaux libres et jamais le nom d'un patient.
@ApiTags('Réservation en ligne (public)')
@UseGuards(IpThrottlerGuard)
@Controller('public/cabinets')
export class ReservationPublicController {
  constructor(private reservationService: ReservationService) {}

  @Get(':slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Infos publiques du cabinet' })
  infos(@Param('slug') slug: string) {
    return this.reservationService.infosPubliques(slug);
  }

  @Get(':slug/creneaux')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: "Heures libres d'une journée" })
  creneaux(@Param('slug') slug: string, @Query() query: CreneauxQueryDto) {
    return this.reservationService.creneaux(slug, query.date);
  }

  @Post(':slug/demandes')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @ApiOperation({ summary: 'Envoyer une demande de rendez-vous' })
  creerDemande(@Param('slug') slug: string, @Body() dto: CreerDemandeDto) {
    return this.reservationService.creerDemande(slug, dto);
  }
}
