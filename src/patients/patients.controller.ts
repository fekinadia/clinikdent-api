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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  UpdatePatientDto,
  UpdateEtiquetteDto,
  ListPatientsQueryDto,
} from './dto/patient.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  // Équipe & rôles (2026-09-29) : identité patient modifiable par
  // assistante/réception, en lecture seule pour comptable (matrice validée
  // par Nadia, roadmap parité Cabinet Care).
  @Roles('admin', 'medecin', 'assistante', 'reception')
  @Post()
  @ApiOperation({ summary: 'Créer un nouveau patient' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(user.cabinetId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les patients (avec recherche & pagination)' })
  findAll(@CurrentUser() user: CurrentUserType, @Query() query: ListPatientsQueryDto) {
    return this.patientsService.findAll(user.cabinetId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques sur les patients' })
  stats(@CurrentUser() user: CurrentUserType) {
    return this.patientsService.getStats(user.cabinetId);
  }

  @Get('recalls')
  @ApiOperation({ summary: 'Lister les patients à relancer (rappel de contrôle)' })
  recalls(@CurrentUser() user: CurrentUserType, @Query('months') months?: string) {
    return this.patientsService.getRecalls(user.cabinetId, months ? Number(months) : 6);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer la fiche complète d\'un patient' })
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.patientsService.findOne(user.cabinetId, id);
  }

  // STEP 4 — historique des no-show du patient (total + liste des RDV
  // marqués no_show, avec l'état de relance associé). Dérivé entièrement
  // des données RDV/relances existantes, isolation cabinet stricte (404).
  @Get(':id/no-shows')
  @ApiOperation({ summary: "Historique des no-show d'un patient" })
  getNoShowHistory(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.patientsService.getNoShowHistory(user.cabinetId, id);
  }

  // Pas de @Roles() ici (2026-10-03, à la demande de Nadia) : l'erreur
  // "droits nécessaires" bloquait l'édition même pour des comptes censés
  // être autorisés — décision : tout utilisateur authentifié du cabinet
  // peut modifier une fiche patient, sans restriction de rôle.
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un patient' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientDto,
    @Req() req: Request,
  ) {
    return this.patientsService.update(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  // Volet G — édition rapide de l'étiquette depuis la liste Patients, sans
  // passer par le PATCH générique (qui remet toujours estProspect à false).
  // Même décision que ci-dessus (2026-10-03) : pas de restriction de rôle.
  @Patch(':id/etiquette')
  @ApiOperation({ summary: "Définir ou retirer l'étiquette libre d'un patient" })
  updateEtiquette(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEtiquetteDto,
  ) {
    return this.patientsService.updateEtiquette(user.cabinetId, id, dto.etiquette);
  }

  // Suppression définitive et en cascade de tout le dossier patient (RDV,
  // soins, paiements, images, ordonnances). Ouvert à tous les utilisateurs
  // du cabinet (médecins compris) depuis le 2026-09-22, à la demande de
  // Nadia — auparavant réservé aux administrateurs (voir la matrice
  // d'autorisation de l'audit du 2026-09-05, désormais obsolète sur ce
  // point précis).
  @Roles('admin', 'medecin', 'assistante', 'reception')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un patient' })
  delete(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.patientsService.delete(user.cabinetId, id, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
