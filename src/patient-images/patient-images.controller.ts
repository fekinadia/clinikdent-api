import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { PatientImagesService } from './patient-images.service';
import { LinkPatientImageDto, UploadPatientImageDto } from './dto/patient-image.dto';

@ApiTags('Patient Images')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('patients/:patientId/images')
export class PatientImagesController {
  constructor(private patientImagesService: PatientImagesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ajouter une photo, radio ou scan au dossier du patient' })
  upload(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPatientImageDto,
  ) {
    return this.patientImagesService.upload(user.cabinetId, patientId, user.userId, file, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister les pièces jointes d'un patient" })
  list(@CurrentUser() user: CurrentUserType, @Param('patientId', ParseIntPipe) patientId: number) {
    return this.patientImagesService.list(user.cabinetId, patientId);
  }

  @Patch(':imageId')
  @ApiOperation({ summary: 'Rattacher une pièce jointe à une consultation (ou la détacher)' })
  link(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Body() dto: LinkPatientImageDto,
  ) {
    return this.patientImagesService.link(user.cabinetId, patientId, imageId, dto.treatmentId ?? null);
  }

  @Delete(':imageId')
  @ApiOperation({ summary: 'Supprimer une pièce jointe' })
  delete(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.patientImagesService.delete(user.cabinetId, patientId, imageId);
  }
}
