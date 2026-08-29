import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

    // Idempotence : une relance existe déjà pour ce RDV.
    const existing = await this.prisma.noShowRecovery.findFirst({
      where: { appointmentId: payload.appointmentId },
    });
    if (existing) return;

    await this.prisma.noShowRecovery.create({
      data: {
        appointmentId: payload.appointmentId,
        statut: 'en_attente',
      },
    });
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
