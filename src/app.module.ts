import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './auth/roles.guard';
import { AuditLogModule } from './audit/audit-log.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { ActsModule } from './acts/acts.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { BillingModule } from './billing/billing.module';
import { PatientImagesModule } from './patient-images/patient-images.module';
import { RemindersModule } from './reminders/reminders.module';
import { StatisticsModule } from './statistics/statistics.module';
import { AutomationModule } from './automation/automation.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { FinanceModule } from './finance/finance.module';
import { SmsModule } from './sms/sms.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    PatientsModule,
    AppointmentsModule,
    TreatmentsModule,
    ActsModule,
    PrescriptionsModule,
    BillingModule,
    PatientImagesModule,
    RemindersModule,
    StatisticsModule,
    AutomationModule,
    WhatsAppModule,
    FinanceModule,
    SmsModule,
    AdminModule,
  ],
  providers: [
    // Enregistré globalement pour éviter de dupliquer @UseGuards(RolesGuard)
    // dans chaque contrôleur — voir src/auth/roles.guard.ts. Ne prend une
    // décision que sur les routes portant explicitement @Roles(...).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
