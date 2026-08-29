import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
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

  @Patch()
  @ApiOperation({ summary: "Modifier les réglages d'automatisation du cabinet" })
  update(@CurrentUser() user: CurrentUserType, @Body() dto: UpdateAutomationSettingsDto) {
    return this.automationSettingsService.update(user.cabinetId, dto);
  }
}
