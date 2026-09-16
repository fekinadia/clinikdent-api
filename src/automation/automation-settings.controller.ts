import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { AutomationSettingsService } from './automation-settings.service';
import { UpdateAutomationSettingsDto } from './dto/automation-settings.dto';

@ApiTags('Automation Settings')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('automation-settings')
export class AutomationSettingsController {
  constructor(private automationSettingsService: AutomationSettingsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Récupérer les réglages d'automatisation du cabinet (créés avec les valeurs par défaut si absents)",
  })
  get(@CurrentUser() user: CurrentUserType) {
    return this.automationSettingsService.get(user.cabinetId);
  }

  // Configuration à l'échelle du cabinet (délais de rappel, activation
  // no-show/recall) — réservée aux administrateurs, voir la matrice
  // d'autorisation de l'audit du 2026-09-05.
  @Patch()
  @Roles('admin')
  @ApiOperation({ summary: "Modifier les réglages d'automatisation du cabinet (admin uniquement)" })
  update(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: UpdateAutomationSettingsDto,
    @Req() req: Request,
  ) {
    return this.automationSettingsService.update(user.cabinetId, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
