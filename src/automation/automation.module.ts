import { Module } from '@nestjs/common';
import { AutomationSettingsController } from './automation-settings.controller';
import { AutomationSettingsService } from './automation-settings.service';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';

@Module({
  controllers: [AutomationSettingsController, WhatsAppTemplatesController],
  providers: [AutomationSettingsService, WhatsAppTemplatesService],
})
export class AutomationModule {}
