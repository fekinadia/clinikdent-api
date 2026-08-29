import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { FinanceService } from './finance.service';

@ApiTags('Facturation')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      "Vue d'ensemble facturation (total encaissé, total impayé, nombre de patients avec impayé)",
  })
  overview(@CurrentUser() user: CurrentUserType, @Query('months') months?: string) {
    const parsed = parseInt(months || '12', 10);
    const safeMonths = Math.min(Math.max(Number.isNaN(parsed) ? 12 : parsed, 1), 36);
    return this.financeService.getOverview(user.cabinetId, safeMonths);
  }

  @Get('unpaid')
  @ApiOperation({ summary: 'Liste des patients ayant un reste dû, triée par montant décroissant' })
  unpaid(@CurrentUser() user: CurrentUserType) {
    return this.financeService.listUnpaid(user.cabinetId);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Historique des encaissements (paiements reçus)' })
  payments(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.financeService.listPayments(
      user.cabinetId,
      from,
      to,
      patientId ? parseInt(patientId, 10) : undefined,
    );
  }
}
