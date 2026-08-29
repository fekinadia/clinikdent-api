import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { NoShowRecoveriesService } from './no-show-recoveries.service';
import { UpdateNoShowRecoveryDto } from './dto/no-show-recovery.dto';

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
  ) {
    return this.noShowRecoveriesService.update(user.cabinetId, id, dto);
  }
}
