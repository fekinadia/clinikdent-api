import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { AdminService } from './admin.service';
import { CreateDemoAccountDto } from './dto/admin.dto';

@ApiTags('Administration plateforme')
@ApiBearerAuth()
@UseGuards(JwtGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('demo-accounts')
  @ApiOperation({ summary: 'Créer un compte démo (24h)' })
  createDemoAccount(@Body() dto: CreateDemoAccountDto) {
    return this.adminService.createDemoAccount(dto);
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
  deleteAccount(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteAccount(id);
  }
}
