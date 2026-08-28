import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { StatisticsService } from './statistics.service';

@ApiTags('Statistiques')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(private statisticsService: StatisticsService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      "Vue d'ensemble des statistiques du cabinet (patients, rendez-vous, recettes, actes)",
  })
  overview(@CurrentUser() user: CurrentUserType, @Query('months') months?: string) {
    const parsed = parseInt(months || '6', 10);
    const safeMonths = Math.min(Math.max(Number.isNaN(parsed) ? 6 : parsed, 1), 24);
    return this.statisticsService.getOverview(user.cabinetId, safeMonths);
  }
}
