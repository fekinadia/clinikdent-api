import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AutomationSettingsService } from './automation-settings.service';

const STATUTS_RDV_INACTIFS = ['annule', 'no_show', 'termine'];

// STEP 4 — statuts de RDV éligibles à la détection automatique de no-show.
// Un RDV déjà annulé, terminé, absent (legacy) ou déjà no_show n'est jamais
// reclassé automatiquement.
const STATUTS_ELIGIBLES_NO_SHOW = ['planifie', 'confirme'];

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
    private automationSettingsService: AutomationSettingsService,
    private eventEmitter: EventEmitter2,
    private auditLog: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    const now = new Date();

    // La détection tourne avant le traitement des relances : un RDV qui
    // vient d'être classé no-show à ce passage peut voir sa relance partir
    // dès ce même cycle si son délai (calculé sur dateDebut, voir
    // processNoShowRecoveries) est déjà écoulé — comportement voulu, pas un
    // bug : dateFin >= dateDebut, donc si le délai de détection (sur
    // dateFin) est atteint, celui de la relance (sur dateDebut) l'est aussi.
    const detected = await this.detectNoShows(now);
    const reminders = await this.processReminders(now);
    const noShows = await this.processNoShowRecoveries(now);
    const recalls = await this.processRecalls(now);

    this.logger.log(
      'Automatisation : ' +
        detected +
        ' no-show(s) détecté(s), ' +
        reminders +
        ' rappel(s) envoyé(s), ' +
        noShows +
        ' relance(s) no-show envoyée(s), ' +
        recalls +
        ' recall(s) envoyé(s)',
    );
  }

  /**
   * STEP 4 — détection automatique : un RDV encore 'planifie'/'confirme'
   * dont la fin remonte à plus de `delaiNoShowHeures` (réglage par cabinet,
   * défaut 24h, jamais codé en dur ici) est reclassé 'no_show'.
   *
   * Pattern claim-then-act identique aux 3 méthodes ci-dessous : la
   * transition est acquise via un updateMany conditionné sur le statut lu,
   * et l'événement n'est émis que si exactement une ligne a été réclamée —
   * un double passage du cron (ou une exécution concurrente) ne peut donc
   * jamais détecter deux fois le même RDV ni émettre l'événement deux fois.
   *
   * Les réglages sont résolus via AutomationSettingsService.get() (et non
   * un simple findMany) pour garantir qu'un cabinet n'ayant jamais encore
   * ouvert ses réglages d'automatisation (donc sans ligne AutomationSettings
   * physique) bénéficie quand même des valeurs par défaut du schéma
   * (noShowActif=true, delaiNoShowHeures=24) plutôt que d'être silencieusement
   * exclu de la détection.
   */
  private async detectNoShows(now: Date): Promise<number> {
    // Pré-filtre large (dateFin <= now) : un RDV ne peut être éligible que si
    // sa fin est déjà passée, quel que soit le délai (toujours >= 1h, voir
    // validation de delaiNoShowHeures). Le délai précis par cabinet est
    // ensuite appliqué en mémoire.
    const candidates = await this.prisma.appointment.findMany({
      where: {
        statut: { in: STATUTS_ELIGIBLES_NO_SHOW },
        dateFin: { lte: now },
      },
      select: { id: true, cabinetId: true, patientId: true, statut: true, dateFin: true },
    });
    if (candidates.length === 0) return 0;

    const cabinetIds = [...new Set(candidates.map((c) => c.cabinetId))];
    const settingsByCabinet = new Map(
      await Promise.all(
        cabinetIds.map(
          async (cabinetId) =>
            [cabinetId, await this.automationSettingsService.get(cabinetId)] as const,
        ),
      ),
    );

    let detected = 0;
    for (const appt of candidates) {
      const settings = settingsByCabinet.get(appt.cabinetId);
      if (!settings?.noShowActif) continue;

      const dueAt = new Date(appt.dateFin.getTime() + settings.delaiNoShowHeures * 3600 * 1000);
      if (dueAt > now) continue;

      const claim = await this.prisma.appointment.updateMany({
        where: { id: appt.id, statut: appt.statut },
        data: { statut: 'no_show' },
      });
      if (claim.count !== 1) continue;

      this.eventEmitter.emit('appointment.no_show', {
        appointmentId: appt.id,
        cabinetId: appt.cabinetId,
        patientId: appt.patientId,
      });

      await this.auditLog.log({
        userId: null,
        cabinetId: appt.cabinetId,
        action: 'appointment.no_show',
        entityType: 'Appointment',
        entityId: appt.id,
        details: { source: 'automatic_detection', ancienStatut: appt.statut },
      });

      detected++;
    }
    return detected;
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
        // Filtre DB de premier niveau : une relance dont le RDV source a été
        // recorrigé hors de no_show entre-temps ne doit normalement même
        // plus être 'en_attente' (voir handleAppointmentNoShowCorrected, qui
        // la bascule en 'annule') — ce filtre est une redondance défensive,
        // pas la garantie principale (voir vérification en mémoire ci-dessous).
        appointment: { statut: 'no_show' },
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
      // STEP 4 — garde défensive obligatoire (au-delà du filtre DB
      // ci-dessus) : même si la relance est encore 'en_attente', on ne
      // déclenche jamais l'envoi si le RDV n'est plus, là, maintenant,
      // no_show. Protège contre toute fenêtre de course entre la lecture
      // (findMany) et l'envoi, quelle qu'en soit la cause.
      if (recovery.appointment.statut !== 'no_show') continue;

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
