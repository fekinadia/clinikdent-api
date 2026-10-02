import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [AuditLogModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
