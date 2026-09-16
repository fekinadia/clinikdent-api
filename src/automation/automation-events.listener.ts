import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationSettingsService } from './automation-settings.service';

const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002';

interface AppointmentCreatedPayload {
  appointmentId: number;
  cabinetId: number;
}

interface AppointmentStatusPayload {
  appointmentId: number;
  cabinetId: number;
}

interface AppointmentWithPatientPayload {
  appointmentId: number;
  cabinetId: number;
  patientId: number;
}

/**
 * Écoute les événements émis par AppointmentsService (Phase 2 - automatisation
 * réelle) et déclenche les actions d'automatisation correspondantes :
 * programmation des rappels, création des recalls, ouverture des relances
 * no-show, annulation des rappels devenus inutiles.
 *
 * Toutes les méthodes sont idempotentes : un événement émis deux fois par
 * erreur ne doit jamais créer de doublon.
 */
@Injectable()
export class AutomationEventsListener {
  private readonly logger = new Logger(AutomationEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private automationSettingsService: AutomationSettingsService,
    private auditLog: AuditLogService,
  ) {}

  @OnEvent('appointment.created')
  async handleAppointmentCreated(payload: AppointmentCreatedPayload) {
    const settings = await this.automationSettingsService.get(payload.cabinetId);
    if (!settings.rappelsActifs) return;

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      select: { dateDebut: true },
    });
    if (!appointment) return;

    for (const offsetHours of settings.rappelOffsetsHeures) {
      try {
        await this.prisma.appointmentReminder.create({
          data: {
            appointmentId: payload.appointmentId,
            offsetHours,
            statut: 'programme',
          },
        });
      } catch (error) {
        // Idempotence : @@unique([appointmentId, offsetHours]) — si le rappel
        // existe déjà (événement émis deux fois), on ignore silencieusement.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  @OnEvent('appointment.completed')
  async handleAppointmentCompleted(payload: AppointmentWithPatientPayload) {
    const settings = await this.automationSettingsService.get(payload.cabinetId);
    if (!settings.recallActif) return;

    // Idempotence : un recall non annulé existe déjà pour ce RDV source.
    const existing = await this.prisma.recall.findFirst({
      where: {
        appointmentSourceId: payload.appointmentId,
        statut: { not: 'annule' },
      },
    });
    if (existing) return;

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      select: { dateDebut: true },
    });
    if (!appointment) return;

    const dateDerniereVisite = appointment.dateDebut;
    const dateEcheance = new Date(dateDerniereVisite);
    dateEcheance.setMonth(dateEcheance.getMonth() + settings.recallDefautMois);

    await this.prisma.recall.create({
      data: {
        patientId: payload.patientId,
        cabinetId: payload.cabinetId,
        typeRecallMois: settings.recallDefautMois,
        dateDerniereVisite,
        dateEcheance,
        statut: 'a_venir',
        appointmentSourceId: payload.appointmentId,
      },
    });
  }

  @OnEvent('appointment.no_show')
  async handleAppointmentNoShow(payload: AppointmentWithPatientPayload) {
    const settings = await this.automationSettingsService.get(payload.cabinetId);
    if (!settings.noShowActif) return;

    // Idempotence : seule une relance encore ACTIVE (`en_attente`) pour ce
    // RDV signifie qu'il n'y a rien à faire (le check-then-act reste la
    // première ligne de défense ; la garantie réelle contre les doublons
    // vient de la contrainte @@unique(appointmentId), rattrapée plus bas).
    //
    // Une relance déjà résolue (`annule`/`recupere`/`perdu`) correspond à
    // un cycle no-show antérieur déjà clos — si le RDV redevient no_show
    // aujourd'hui (marqué à nouveau après une correction, ou re-détecté par
    // le cron), il faut réactiver le workflow, pas l'ignorer silencieusement.
    // Bug confirmé le 2026-09-09 (checklist STEP4 section 6) : l'ancienne
    // version traitait toute relance existante, quel que soit son statut,
    // comme une preuve d'idempotence — un RDV repassé no_show après une
    // correction ne recevait alors plus jamais de relance.
    const existing = await this.prisma.noShowRecovery.findFirst({
      where: { appointmentId: payload.appointmentId },
    });
    if (existing?.statut === 'en_attente') return;

    let recovery;
    try {
      if (existing) {
        // La contrainte @@unique(appointmentId) interdit un second create()
        // pour ce RDV : on réactive la relance existante (déjà résolue) en
        // la remettant à 'en_attente', et on efface ce qui appartenait à
        // son ancien cycle (date d'envoi précédente, lien vers un ancien
        // "nouveau RDV") pour repartir sur une relance propre. On avance
        // aussi `createdAt` pour qu'elle réapparaisse en tête de la liste
        // des relances (tri par `createdAt: desc`), comme une relance neuve.
        recovery = await this.prisma.noShowRecovery.update({
          where: { id: existing.id },
          data: {
            statut: 'en_attente',
            relanceEnvoyeeAt: null,
            nouveauAppointmentId: null,
            createdAt: new Date(),
          },
        });
      } else {
        recovery = await this.prisma.noShowRecovery.create({
          data: {
            appointmentId: payload.appointmentId,
            statut: 'en_attente',
          },
        });
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
      ) {
        // Une autre exécution concurrente a créé la relance entre notre
        // lecture et notre écriture : rien à faire, pas de doublon.
        return;
      }
      throw error;
    }

    // Événement système par nature (peu importe si le no-show a été
    // détecté automatiquement ou marqué manuellement — voir 'appointment.no_show'
    // pour l'audit de CE déclenchement) : userId volontairement absent.
    await this.auditLog.log({
      userId: null,
      cabinetId: payload.cabinetId,
      action: 'no_show_recovery.created',
      entityType: 'NoShowRecovery',
      entityId: recovery.id,
      details: { appointmentId: payload.appointmentId },
    });
  }

  /**
   * STEP 4 — correction d'une classification no-show erronée : le RDV
   * source est sorti du statut no_show (voir AppointmentsService.update()).
   * On invalide la relance associée (statut 'annule', jamais supprimée —
   * garde l'historique) pour que le scheduler ne l'envoie plus jamais.
   * Idempotent par construction : updateMany ne cible que 'en_attente', un
   * second appel sur une relance déjà 'annule'/'recupere'/'perdu' est un
   * no-op silencieux (count === 0).
   */
  @OnEvent('appointment.no_show_corrected')
  async handleAppointmentNoShowCorrected(payload: AppointmentStatusPayload) {
    const result = await this.prisma.noShowRecovery.updateMany({
      where: { appointmentId: payload.appointmentId, statut: 'en_attente' },
      data: { statut: 'annule' },
    });

    if (result.count > 0) {
      this.logger.log(
        `Relance no-show annulée pour le RDV ${payload.appointmentId} (statut corrigé)`,
      );
    }
  }

  @OnEvent('appointment.cancelled')
  async handleAppointmentCancelled(payload: AppointmentStatusPayload) {
    // On annule les rappels encore programmés pour ne jamais envoyer un
    // rappel WhatsApp pour un RDV qui n'a plus lieu d'être.
    // Choix : on ajoute la valeur 'annule' (plutôt que réutiliser 'echec',
    // qui désignerait un échec technique d'envoi) pour distinguer clairement
    // dans le suivi un rappel annulé (RDV annulé) d'un rappel qui a échoué.
    const result = await this.prisma.appointmentReminder.updateMany({
      where: { appointmentId: payload.appointmentId, statut: 'programme' },
      data: { statut: 'annule' },
    });

    if (result.count > 0) {
      this.logger.log(
        `${result.count} rappel(s) annulé(s) pour le RDV ${payload.appointmentId} (RDV annulé)`,
      );
    }
  }
}
