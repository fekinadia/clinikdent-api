import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditLogModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
