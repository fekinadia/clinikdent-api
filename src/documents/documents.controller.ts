import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, ListDocumentsQueryDto } from './dto/document.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller()
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  // Équipe & rôles (2026-09-29) : mêmes règles que soins/ordonnances —
  // assistante en lecture seule, réception/comptable aucun accès.
  @Roles('admin', 'medecin')
  @Post('documents')
  @ApiOperation({ summary: "Créer un document (certificat, lettre de liaison, devis, note d'honoraires)" })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(user.cabinetId, user.userId, dto);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('documents')
  @ApiOperation({ summary: 'Liste des documents du cabinet (page Documents)' })
  findAll(@CurrentUser() user: CurrentUserType, @Query() query: ListDocumentsQueryDto) {
    return this.documentsService.findAllByCabinet(user.cabinetId, query);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('patients/:patientId/documents')
  @ApiOperation({ summary: "Documents d'un patient" })
  findByPatient(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.documentsService.findByPatient(user.cabinetId, patientId);
  }

  @Roles('admin', 'medecin', 'assistante')
  @Get('documents/:id')
  @ApiOperation({ summary: 'Détail d\'un document' })
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.documentsService.findOne(user.cabinetId, id);
  }
}
