import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
}
