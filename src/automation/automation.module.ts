import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AutomationSettingsController } from './automation-settings.controller';
import { AutomationSettingsService } from './automation-settings.service';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { AppointmentRemindersController } from './appointment-reminders.controller';
import { AppointmentRemindersService } from './appointment-reminders.service';
import { NoShowRecoveriesController } from './no-show-recoveries.controller';
import { NoShowRecoveriesService } from './no-show-recoveries.service';
import { RecallsController } from './recalls.controller';
import { RecallsService } from './recalls.service';
import { AutomationEventsListener } from './automation-events.listener';
import { AutomationSchedulerService } from './automation-scheduler.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [
    AutomationSettingsController,
    WhatsAppTemplatesController,
    AppointmentRemindersController,
    NoShowRecoveriesController,
    RecallsController,
  ],
  providers: [
    AutomationSettingsService,
    WhatsAppTemplatesService,
    AppointmentRemindersService,
    NoShowRecoveriesService,
    RecallsService,
    AutomationEventsListener,
    AutomationSchedulerService,
  ],
})
export class AutomationModule {}
