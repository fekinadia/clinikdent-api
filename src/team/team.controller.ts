import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { TeamService } from './team.service';
import { InviteMemberDto, UpdateMemberDto } from './dto/team.dto';

// Équipe & rôles (Phase 2, 2026-09-29) : réservé à l'admin du cabinet —
// voir la matrice de droits validée par Nadia dans
// claude/roadmap-parite-cabinet-care-2026-09-26.md.
@ApiTags('Équipe')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Roles('admin')
@Controller('team')
export class TeamController {
  constructor(private teamService: TeamService) {}

  @Get()
  @ApiOperation({ summary: "Lister les membres de l'équipe du cabinet" })
  list(@CurrentUser() user: CurrentUserType) {
    return this.teamService.listMembers(user.cabinetId);
  }

  @Post()
  @ApiOperation({ summary: "Inviter un membre de l'équipe (mot de passe à usage unique)" })
  invite(@CurrentUser() user: CurrentUserType, @Body() dto: InviteMemberDto, @Req() req: Request) {
    return this.teamService.inviteMember(user.cabinetId, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: "Changer le rôle d'un membre, ou le désactiver/réactiver" })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
    @Req() req: Request,
  ) {
    return this.teamService.updateMember(user.cabinetId, id, dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
