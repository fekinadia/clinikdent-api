import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { TreatmentsService } from './treatments.service';
import { CreateTreatmentDto, UpdateToothStateDto } from './dto/treatment.dto';

@ApiTags('Soins & Schéma dentaire')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller()
export class TreatmentsController {
  constructor(private treatmentsService: TreatmentsService) {}

  @Post('treatments')
  @ApiOperation({ summary: 'Créer une séance de soins avec ses actes' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateTreatmentDto) {
    return this.treatmentsService.create(user.cabinetId, user.userId, dto);
  }

  @Get('patients/:patientId/treatments')
  @ApiOperation({ summary: "Historique des soins d'un patient" })
  findByPatient(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.treatmentsService.findByPatient(user.cabinetId, patientId);
  }

  @Get('patients/:patientId/financial-summary')
  @ApiOperation({ summary: 'Résumé financier (dû, payé, reste)' })
  financialSummary(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.treatmentsService.getFinancialSummary(user.cabinetId, patientId);
  }

  @Get('patients/:patientId/tooth-chart')
  @ApiOperation({ summary: 'Récupérer le schéma dentaire' })
  getChart(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.treatmentsService.getToothChart(user.cabinetId, patientId);
  }

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
}
