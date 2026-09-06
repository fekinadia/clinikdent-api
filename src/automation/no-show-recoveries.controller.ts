import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { NoShowRecoveriesService } from './no-show-recoveries.service';
import { UpdateNoShowRecoveryDto, MarkRecoveredDto } from './dto/no-show-recovery.dto';

@ApiTags('No-Show Recoveries')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('no-show-recoveries')
export class NoShowRecoveriesController {
  constructor(private noShowRecoveriesService: NoShowRecoveriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les relances no-show du cabinet' })
  findAll(@CurrentUser() user: CurrentUserType, @Query('statut') statut?: string) {
    return this.noShowRecoveriesService.findAll(user.cabinetId, statut);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Marquer une relance no-show comme perdue (abandon manuel)' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNoShowRecoveryDto,
    @Req() req: Request,
  ) {
    return this.noShowRecoveriesService.update(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  // STEP 4 — workflow de récupération : le patient a repris rendez-vous
  // (ou a été recontacté avec succès). Endpoint dédié plutôt qu'une valeur
  // supplémentaire sur le PATCH générique existant, pour permettre la
  // validation du lien optionnel vers le nouveau RDV.
  @Patch(':id/recovered')
  @ApiOperation({ summary: 'Marquer une relance no-show comme récupérée' })
  markRecovered(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkRecoveredDto,
    @Req() req: Request,
  ) {
    return this.noShowRecoveriesService.markRecovered(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
