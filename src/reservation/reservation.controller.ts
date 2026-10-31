import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { ConfirmerDemandeDto, ReglagesReservationDto } from './dto/reservation.dto';
import { ReservationService } from './reservation.service';

@ApiTags('Réservation en ligne')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Roles('admin', 'medecin', 'assistante', 'reception')
@Controller('reservation')
export class ReservationController {
  constructor(private reservationService: ReservationService) {}

  @Get('reglages')
  @ApiOperation({ summary: 'Réglages de la réservation en ligne' })
  reglages(@CurrentUser() user: CurrentUserType) {
    return this.reservationService.reglages(user.cabinetId);
  }

  @Patch('reglages')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier les réglages de la réservation en ligne' })
  modifierReglages(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ReglagesReservationDto,
    @Req() req: Request,
  ) {
    return this.reservationService.modifierReglages(user.cabinetId, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Get('demandes')
  @ApiOperation({ summary: 'Demandes de rendez-vous en attente' })
  demandes(@CurrentUser() user: CurrentUserType) {
    return this.reservationService.demandes(user.cabinetId);
  }

  @Get('demandes/compte')
  @ApiOperation({ summary: 'Nombre de demandes en attente' })
  compterDemandes(@CurrentUser() user: CurrentUserType) {
    return this.reservationService.compterDemandes(user.cabinetId);
  }

  @Get('demandes/a-prevenir')
  @ApiOperation({ summary: 'Demandes traitées récemment, à annoncer au patient sur WhatsApp' })
  aPrevenir(@CurrentUser() user: CurrentUserType) {
    return this.reservationService.aPrevenir(user.cabinetId);
  }

  @Post('demandes/:id/confirmer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer une demande : crée le rendez-vous dans l’agenda' })
  confirmer(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmerDemandeDto,
    @Req() req: Request,
  ) {
    return this.reservationService.confirmer(user, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Post('demandes/:id/refuser')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuser une demande : le créneau redevient libre' })
  refuser(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.reservationService.refuser(user.cabinetId, id, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
