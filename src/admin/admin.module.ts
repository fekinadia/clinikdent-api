import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  imports: [AuditLogModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard],
})
export class AdminModule {}
