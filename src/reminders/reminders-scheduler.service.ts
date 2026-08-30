import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

/**
 * Envoie automatiquement un SMS au patient lorsqu'un rappel manuel
 * (pense-bête, voir RemindersService) arrive à échéance (dateRappel <=
 * aujourd'hui), no-op tant que WINSMS_API_KEY n'est pas configurée.
 *
 * Même pattern "claim-then-send" que AutomationSchedulerService
 * (src/automation/) : on bascule d'abord smsEnvoye à true via un
 * updateMany conditionné sur son état actuel, puis on ne procède à l'envoi
 * que si exactement une ligne a été réclamée (count === 1). Cela garantit
 * qu'un double passage du cron n'envoie jamais deux fois le même SMS.
 */
@Injectable()
export class RemindersSchedulerService {
  private readonly logger = new Logger(RemindersSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleCron() {
    const now = new Date();
    const finJournee = new Date(now);
    finJournee.setHours(23, 59, 59, 999);

    const candidates = await this.prisma.reminder.findMany({
      where: {
        smsEnvoye: false,
        termine: false,
        dateRappel: { lte: finJournee },
      },
      include: {
        patient: { select: { gsm: true, prenom: true } },
        cabinet: { select: { nom: true, telephone: true } },
      },
    });

    if (candidates.length === 0) return;

    let sent = 0;
    for (const reminder of candidates) {
      const claim = await this.prisma.reminder.updateMany({
        where: { id: reminder.id, smsEnvoye: false },
        data: { smsEnvoye: true, smsEnvoyeAt: now },
      });
      if (claim.count !== 1) continue;

      if (!reminder.patient?.gsm) {
        this.logger.warn(
          `Rappel ${reminder.id} : pas de numéro de téléphone pour le patient, SMS ignoré`,
        );
        continue;
      }

      const prenom = reminder.patient.prenom || '';
      const cabinetNom = reminder.cabinet?.nom || 'Votre cabinet dentaire';
      const noteTxt = reminder.note ? reminder.note : 'un rappel de suivi';
      const contact = reminder.cabinet?.telephone
        ? ` Contactez-nous au ${reminder.cabinet.telephone}.`
        : '';
      const message = `Bonjour ${prenom}, ${cabinetNom} vous rappelle : ${noteTxt}.${contact}`;

      const senderId = this.smsService.sanitizeSenderId(reminder.cabinet?.nom);
      const result = await this.smsService.sendSms(reminder.patient.gsm, message, senderId);
      if (result.success) sent++;
    }

    this.logger.log(`Rappels manuels : ${sent}/${candidates.length} SMS envoyé(s)`);
  }
}
