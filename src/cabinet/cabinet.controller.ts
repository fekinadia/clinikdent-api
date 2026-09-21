import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { CabinetService } from './cabinet.service';

@ApiTags('Cabinet')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('cabinet')
export class CabinetController {
  constructor(private cabinetService: CabinetService) {}

  @Get('me')
  @ApiOperation({ summary: "Infos du cabinet et du médecin connecté (entête des documents imprimés)" })
  getMe(@CurrentUser() user: CurrentUserType) {
    return this.cabinetService.getMe(user.cabinetId, user.userId);
  }
}
