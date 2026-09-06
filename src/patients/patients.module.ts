import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [AuditLogModule],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
