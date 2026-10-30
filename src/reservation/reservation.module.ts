import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { PatientsModule } from '../patients/patients.module';
import { ReservationPublicController } from './reservation-public.controller';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  imports: [AuditLogModule, PatientsModule, AppointmentsModule],
  controllers: [ReservationController, ReservationPublicController],
  providers: [ReservationService],
})
export class ReservationModule {}
