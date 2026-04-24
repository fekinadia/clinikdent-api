import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';

@ApiTags('Ordonnances')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller()
export class PrescriptionsController {
  constructor(private prescriptionsService: PrescriptionsService) {}

  @Post('prescriptions')
  @ApiOperation({ summary: 'Créer une ordonnance' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(user.cabinetId, user.userId, dto);
  }

  @Get('patients/:patientId/prescriptions')
  @ApiOperation({ summary: "Ordonnances d'un patient" })
  findByPatient(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.prescriptionsService.findByPatient(user.cabinetId, patientId);
  }

  @Get('prescriptions/:id')
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.prescriptionsService.findOne(user.cabinetId, id);
  }

  @Get('medications')
  @ApiOperation({ summary: 'Catalogue des médicaments (avec recherche)' })
  listMedications(@Query('search') search?: string) {
    return this.prescriptionsService.listMedications(search);
  }

  @Get('prescription-templates')
  @ApiOperation({ summary: 'Ordonnances types' })
  listTemplates(@CurrentUser() user: CurrentUserType) {
    return this.prescriptionsService.listTemplates(user.cabinetId);
  }
}
