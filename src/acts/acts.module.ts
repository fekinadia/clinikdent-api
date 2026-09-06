import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { ActsController } from './acts.controller';
import { ActsService } from './acts.service';

@Module({
  imports: [AuditLogModule],
  controllers: [ActsController],
  providers: [ActsService],
  exports: [ActsService],
})
export class ActsModule {}
