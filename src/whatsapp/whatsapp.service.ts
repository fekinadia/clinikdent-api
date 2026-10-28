import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private isConfigured(): boolean {
    return !!process.env.WHATSAPP_API_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  async sendMessage(to: string, body: string): Promise<{ success: boolean; messageId?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp non configuré, envoi ignoré (no-op)');
      return { success: false };
    }
    // TODO Phase 2 : appel réel à l'API Cloud Meta WhatsApp Business
    this.logger.warn('WhatsApp non configuré, envoi ignoré (no-op)');
    return { success: false };
  }

  async sendTemplate(
    to: string,
    templateName: string,
    variables: Record<string, string>,
  ): Promise<{ success: boolean; messageId?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp non configuré, envoi de template ignoré (no-op)');
      return { success: false };
    }
    this.logger.warn('WhatsApp non configuré, envoi de template ignoré (no-op)');
    return { success: false };
  }

  async sendAppointmentReminder(
    to: string,
    appointmentId: number,
    offsetHours: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    this.logger.warn(
      `WhatsApp non configuré, rappel RDV ${appointmentId} (${offsetHours}h) ignoré (no-op)`,
    );
    return { success: false };
  }

  async sendNoShowFollowUp(
    to: string,
    appointmentId: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    this.logger.warn(
      `WhatsApp non configuré, relance no-show RDV ${appointmentId} ignorée (no-op)`,
    );
    return { success: false };
  }

  async sendRecall(
    to: string,
    recallId: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    this.logger.warn(`WhatsApp non configuré, recall ${recallId} ignoré (no-op)`);
    return { success: false };
  }

  async handleWebhook(payload: unknown): Promise<{ success: boolean }> {
    this.logger.warn('WhatsApp non configuré, webhook entrant ignoré (no-op)');
    return { success: false };
  }
}
