import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { adresseClient, IpThrottlerGuard } from '../auth/ip-throttler.guard';
import { CreerEssaiDto } from './dto/essai.dto';
import { EssaiService } from './essai.service';

@ApiTags('Essai en un clic (public)')
@UseGuards(IpThrottlerGuard)
@Controller('public/essai')
export class EssaiPublicController {
  constructor(private essaiService: EssaiService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: "Créer un cabinet d'essai rempli de patients fictifs" })
  creer(@Body() dto: CreerEssaiDto, @Req() req: Request) {
    return this.essaiService.creer(dto, adresseClient(req));
  }
}
