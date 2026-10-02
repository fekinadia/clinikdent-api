import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto, CreatePrescriptionModeleDto } from './dto/prescription.dto';

@ApiTags('Ordonnances')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller()
export class PrescriptionsController {
  constructor(private prescriptionsService: PrescriptionsService) {}

  // Équipe & rôles (2026-09-29) : même règle que soins/odontogramme —
  // assistante en lecture seule, réception/comptable aucun accès.
  @Roles('admin', 'medecin')
  @Post('prescriptions')
  @ApiOperation({ summary: 'Créer une ordonnance' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(user.cabinetId, user.userId, dto);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('prescriptions')
  @ApiOperation({ summary: 'Liste des ordonnances du cabinet (page Documents)' })
  findAll(
    @CurrentUser() user: CurrentUserType,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.prescriptionsService.findAllByCabinet(user.cabinetId, { search, page, limit });
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('patients/:patientId/prescriptions')
  @ApiOperation({ summary: "Ordonnances d'un patient" })
  findByPatient(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.prescriptionsService.findByPatient(user.cabinetId, patientId);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('prescriptions/:id')
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.prescriptionsService.findOne(user.cabinetId, id);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('medications')
  @ApiOperation({ summary: 'Catalogue des médicaments (avec recherche)' })
  listMedications(@Query('search') search?: string) {
    return this.prescriptionsService.listMedications(search);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('prescription-templates')
  @ApiOperation({ summary: 'Ordonnances types' })
  listTemplates(@CurrentUser() user: CurrentUserType) {
    return this.prescriptionsService.listTemplates(user.cabinetId);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('prescription-modeles')
  @ApiOperation({ summary: "Modèles d'ordonnances (texte libre) du cabinet" })
  listModeles(@CurrentUser() user: CurrentUserType) {
    return this.prescriptionsService.listModeles(user.cabinetId);
  }

  @Roles('admin', 'medecin')
  @Post('prescription-modeles')
  @ApiOperation({ summary: "Créer un modèle d'ordonnance réutilisable" })
  createModele(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePrescriptionModeleDto) {
    return this.prescriptionsService.createModele(user.cabinetId, user.userId, dto);
  }

  @Roles('admin', 'medecin')
  @Delete('prescription-modeles/:id')
  @ApiOperation({ summary: "Supprimer un modèle d'ordonnance" })
  deleteModele(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.prescriptionsService.deleteModele(user.cabinetId, id);
  }
}
