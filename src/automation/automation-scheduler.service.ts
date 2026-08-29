import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const STATUTS_RDV_INACTIFS = ['annule', 'no_show', 'termine'];

/**
 * Traite périodiquement les rappels de RDV, les relances no-show et les
 * recalls arrivés à échéance, et déclenche l'envoi WhatsApp correspondant
 * (no-op tant que les credentials Meta ne sont pas configurées).
 *
 * Chaque envoi suit un pattern "claim-then-send" : on bascule d'abord la
 * ligne dans un nouveau statut via un updateMany conditionné sur son statut
 * actuel, puis on ne procède à l'envoi que si exactement une ligne a été
 * réclamée (count === 1). Cela garantit qu'un double passage du cron (ou une
 * exécution concurrente) n'envoie jamais deux fois le même message.
 */
@Injectable()
export class AutomationSchedulerService {
  private readonly logger = new Logger(AutomationSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsAppService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    const now = new Date();

    const reminders = await this.processReminders(now);
    const noShows = await this.processNoShowRecoveries(now);
    const recalls = await this.processRecalls(now);

    this.logger.log(
      'Automatisation : ' +
        reminders +
        ' rappel(s) envoyé(s), ' +
        noShows +
        ' relance(s) no-show envoyée(s), ' +
        recalls +
        ' recall(s) envoyé(s)',
    );
  }

  private async processReminders(now: Date): Promise<number> {
    const candidates = await this.prisma.appointmentReminder.findMany({
      where: {
        statut: 'programme',
        appointment: {
          statut: { notIn: STATUTS_RDV_INACTIFS },
        },
      },
      include: {
        appointment: { include: { patient: true } },
      },
    });

    let sent = 0;
    for (const reminder of candidates) {
      const dueAt = new Date(
        reminder.appointment.dateDebut.getTime() - reminder.offsetHours * 3600 * 1000,
      );
      if (dueAt > now) continue;

      const claim = await this.prisma.appointmentReminder.updateMany({
        where: { id: reminder.id, statut: 'programme' },
        data: { statut: 'envoye', envoyeAt: now },
      });
      if (claim.count !== 1) continue;

      await this.whatsappService.sendAppointmentReminder(
        reminder.appointment.patient.gsm,
        reminder.appointmentId,
        reminder.offsetHours,
      );
      sent++;
    }
    return sent;
  }

  private async processNoShowRecoveries(now: Date): Promise<number> {
    const candidates = await this.prisma.noShowRecovery.findMany({
      where: {
        statut: 'en_attente',
        relanceEnvoyeeAt: null,
      },
      include: {
        appointment: { include: { patient: true } },
      },
    });
    if (candidates.length === 0) return 0;

    const cabinetIds = [...new Set(candidates.map((c) => c.appointment.cabinetId))];
    const settingsList = await this.prisma.automationSettings.findMany({
      where: { cabinetId: { in: cabinetIds } },
    });
    const settingsByCabinet = new Map(settingsList.map((s) => [s.cabinetId, s]));

    let sent = 0;
    for (const recovery of candidates) {
      const delaiHeures =
        settingsByCabinet.get(recovery.appointment.cabinetId)?.delaiNoShowHeures ?? 24;
      const dueAt = new Date(
        recovery.appointment.dateDebut.getTime() + delaiHeures * 3600 * 1000,
      );
      if (dueAt > now) continue;

      const claim = await this.prisma.noShowRecovery.updateMany({
        where: { id: recovery.id, statut: 'en_attente', relanceEnvoyeeAt: null },
        data: { relanceEnvoyeeAt: now },
      });
      if (claim.count !== 1) continue;

      await this.whatsappService.sendNoShowFollowUp(
        recovery.appointment.patient.gsm,
        recovery.appointmentId,
      );
      sent++;
    }
    return sent;
  }

  private async processRecalls(now: Date): Promise<number> {
    const candidates = await this.prisma.recall.findMany({
      where: {
        statut: 'a_venir',
        dateEcheance: { lte: now },
      },
      include: { patient: true },
    });

    let sent = 0;
    for (const recall of candidates) {
      const claim = await this.prisma.recall.updateMany({
        where: { id: recall.id, statut: 'a_venir' },
        data: { statut: 'du' },
      });
      if (claim.count !== 1) continue;

      await this.whatsappService.sendRecall(recall.patient.gsm, recall.id);

      // Pas besoin de re-claim ici : le passage à 'du' ci-dessus a déjà été
      // acquis de façon exclusive par ce process pour cette ligne.
      await this.prisma.recall.update({
        where: { id: recall.id },
        data: { statut: 'envoye' },
      });
      sent++;
    }
    return sent;
  }
}
