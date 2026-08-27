import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { BillingModule } from './billing/billing.module';
import { PatientImagesModule } from './patient-images/patient-images.module';
import { RemindersModule } from './reminders/reminders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    AppointmentsModule,
    TreatmentsModule,
    PrescriptionsModule,
    BillingModule,
    PatientImagesModule,
    RemindersModule,
  ],
})
export class AppModule {}
