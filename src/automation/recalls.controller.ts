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
import { RecallsService } from './recalls.service';
import { CreateRecallDto, UpdateRecallDto } from './dto/recall.dto';

// Note : distinct de GET /patients/recalls (calcul à la volée, existant,
// non modifié). Ce contrôleur expose les recalls persistés (Phase 2).
@ApiTags('Recalls')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('recalls')
export class RecallsController {
  constructor(private recallsService: RecallsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les recalls persistés du cabinet' })
  findAll(@CurrentUser() user: CurrentUserType, @Query('statut') statut?: string) {
    return this.recallsService.findAll(user.cabinetId, statut);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un recall manuellement' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateRecallDto) {
    return this.recallsService.create(user.cabinetId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Modifier un recall (échéance, type, ou annulation)" })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecallDto,
  ) {
    return this.recallsService.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un recall' })
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.recallsService.delete(user.cabinetId, id);
  }
}
