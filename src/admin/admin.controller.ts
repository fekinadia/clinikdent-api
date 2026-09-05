import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { CreateDemoAccountDto } from './dto/admin.dto';

// Cet ensemble de routes est réservé à l'administrateur de la plateforme
// (liste blanche d'e-mails, PlatformAdminGuard) — orthogonal au rôle
// admin/medecin d'un cabinet, qui n'a aucune portée cross-cabinet. Non
// modifié par le chantier RBAC du 2026-09-05 ; seul l'ajout de la
// traçabilité (qui a créé/supprimé quel compte) est nouveau ici.
@ApiTags('Administration plateforme')
@ApiBearerAuth()
@UseGuards(JwtGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('demo-accounts')
  @ApiOperation({ summary: 'Créer un compte démo (24h) ou permanent' })
  createDemoAccount(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreateDemoAccountDto,
    @Req() req: Request,
  ) {
    return this.adminService.createDemoAccount(dto, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  @Get('demo-accounts')
  @ApiOperation({ summary: 'Lister les comptes démo' })
  listDemoAccounts() {
    return this.adminService.listDemoAccounts();
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Lister tous les comptes (démo + permanents)' })
  listAllAccounts() {
    return this.adminService.listAllAccounts();
  }

  @Delete('accounts/:id')
  @ApiOperation({
    summary:
      'Supprimer définitivement un compte (cabinet) et toutes ses données liées',
  })
  deleteAccount(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.deleteAccount(id, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }
}
