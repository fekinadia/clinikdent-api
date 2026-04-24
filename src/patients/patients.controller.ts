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
  ) {
    return this.patientsService.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un patient' })
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.patientsService.delete(user.cabinetId, id);
  }
}
