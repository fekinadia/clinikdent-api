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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

// Dépenses du cabinet (loyer, salaires, fournitures, etc.) : lecture
// partagée admin + médecin (même logique que le catalogue d'actes et la
// page Facturation), mutations réservées à l'admin car c'est de l'argent
// qui sort du cabinet — voir la matrice d'autorisation STEP 3 (ActsController).
@ApiTags('Dépenses')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les dépenses du cabinet (filtrable par date et catégorie)' })
  findAll(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categorie') categorie?: string,
  ) {
    return this.expensesService.findAll(user.cabinetId, from, to, categorie);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Total des dépenses sur une période + répartition par catégorie' })
  overview(@CurrentUser() user: CurrentUserType, @Query('months') months?: string) {
    const parsed = parseInt(months || '12', 10);
    const safeMonths = Math.min(Math.max(Number.isNaN(parsed) ? 12 : parsed, 1), 36);
    return this.expensesService.getOverview(user.cabinetId, safeMonths);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Enregistrer une nouvelle dépense (admin uniquement)' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateExpenseDto, @Req() req: Request) {
    return this.expensesService.create(user.cabinetId, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier une dépense (admin uniquement)' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @Req() req: Request,
  ) {
    return this.expensesService.update(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Supprimer une dépense (admin uniquement)' })
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.expensesService.delete(user.cabinetId, id, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
