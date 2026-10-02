import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { TreatmentsService } from './treatments.service';
import {
  CreateTreatmentDto,
  RecordPaymentDto,
  UpdateToothStateDto,
  UpdateTreatmentDto,
} from './dto/treatment.dto';

@ApiTags('Soins & Schéma dentaire')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller()
export class TreatmentsController {
  constructor(private treatmentsService: TreatmentsService) {}

  // Équipe & rôles (2026-09-29) : soins/odontogramme/ordonnances en lecture
  // seule pour assistante, aucun accès pour réception/comptable.
  @Roles('admin', 'medecin')
  @Post('treatments')
  @ApiOperation({ summary: 'Créer une séance de soins avec ses actes' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateTreatmentDto) {
    return this.treatmentsService.create(user.cabinetId, user.userId, dto);
  }

  @Roles('admin', 'medecin')
  @Patch('treatments/:id')
  @ApiOperation({
    summary:
      "Modifier la date, les actes (libellé, dents, prix) et les observations d'une séance de soins",
  })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTreatmentDto,
    @Req() req: Request,
  ) {
    return this.treatmentsService.update(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('patients/:patientId/treatments')
  @ApiOperation({ summary: "Historique des soins d'un patient" })
  findByPatient(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.treatmentsService.findByPatient(user.cabinetId, patientId);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('patients/:patientId/financial-summary')
  @ApiOperation({ summary: 'Résumé financier (dû, payé, reste)' })
  financialSummary(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.treatmentsService.getFinancialSummary(user.cabinetId, patientId);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('patients/:patientId/tooth-chart')
  @ApiOperation({ summary: 'Récupérer le schéma dentaire' })
  getChart(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.treatmentsService.getToothChart(user.cabinetId, patientId);
  }

  @Roles('admin', 'medecin')
  @Put('patients/:patientId/tooth-chart')
  @ApiOperation({ summary: "Modifier l'état d'une dent" })
  updateTooth(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: UpdateToothStateDto,
  ) {
    return this.treatmentsService.upsertToothState(
      user.cabinetId,
      user.userId,
      patientId,
      dto,
    );
  }

  // Caisse : accessible à toute l'équipe (assistante/réception/comptable
  // inclus), même si le reste du dossier soins ne l'est pas.
  @Roles('admin', 'medecin', 'assistante', 'reception', 'comptable')
  @Patch('treatments/acts/:actId/payment')
  @ApiOperation({ summary: 'Enregistrer un paiement sur un acte' })
  recordPayment(
    @CurrentUser() user: CurrentUserType,
    @Param('actId', ParseIntPipe) actId: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.treatmentsService.recordPayment(user.cabinetId, user.userId, actId, dto);
  }
}
