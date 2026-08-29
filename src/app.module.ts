import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { BillingModule } from './billing/billing.module';
import { PatientImagesModule } from './patient-images/patient-images.module';
import { RemindersModule } from './reminders/reminders.module';
import { StatisticsModule } from './statistics/statistics.module';
import { AutomationModule } from './automation/automation.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { FinanceModule } from './finance/finance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PatientsModule,
    AppointmentsModule,
    TreatmentsModule,
    PrescriptionsModule,
    BillingModule,
    PatientImagesModule,
    RemindersModule,
    StatisticsModule,
    AutomationModule,
    WhatsAppModule,
    FinanceModule,
  ],
})
export class AppModule {}
