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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { ActsService } from './acts.service';
import { CreateActDto, UpdateActDto } from './dto/act.dto';

@ApiTags('Catalogue des actes')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('acts')
export class ActsController {
  constructor(private actsService: ActsService) {}

  // Configuration cabinet (prix, actes proposés) : lecture partagée
  // admin + médecin, mutations réservées à l'admin — voir la matrice
  // d'autorisation STEP 3.
  @Get()
  @ApiOperation({ summary: 'Lister les actes du catalogue du cabinet' })
  findAll(
    @CurrentUser() user: CurrentUserType,
    @Query('search') search?: string,
    @Query('categorie') categorie?: string,
    @Query('actif') actif?: string,
  ) {
    return this.actsService.findAll(user.cabinetId, {
      search,
      categorie,
      actif: actif === undefined ? undefined : actif === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un acte du catalogue' })
  findOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.actsService.findOne(user.cabinetId, id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Créer un acte du catalogue (admin uniquement)' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateActDto, @Req() req: Request) {
    return this.actsService.create(user.cabinetId, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier un acte du catalogue (admin uniquement)' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActDto,
    @Req() req: Request,
  ) {
    return this.actsService.update(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Patch(':id/toggle')
  @Roles('admin')
  @ApiOperation({ summary: 'Activer / désactiver un acte (admin uniquement)' })
  toggle(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.actsService.toggle(user.cabinetId, id, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Supprimer un acte (admin uniquement) — désactivé plutôt que supprimé si déjà utilisé dans des soins',
  })
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.actsService.delete(user.cabinetId, id, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
