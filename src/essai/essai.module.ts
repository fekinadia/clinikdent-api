import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { EssaiPublicController } from './essai-public.controller';
import { EssaiService } from './essai.service';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [EssaiPublicController],
  providers: [EssaiService],
})
export class EssaiModule {}
