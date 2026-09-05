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
  ListPatientsQueryDto,
} from './dto/patient.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

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

  // Réservé aux administrateurs du cabinet — suppression définitive et en
  // cascade de tout le dossier patient (RDV, soins, paiements, images,
  // ordonnances). Voir la matrice d'autorisation de l'audit du 2026-09-05.
  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprimer un patient (réservé aux administrateurs)' })
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
