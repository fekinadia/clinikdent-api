import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import {
  CreateTreatmentDto,
  RecordPaymentDto,
  UpdateToothStateDto,
  UpdateTreatmentDto,
} from './dto/treatment.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

// Champs de TreatmentAct réellement lus dans update() ci-dessous. Typé
// explicitement (plutôt que de compter sur l'inférence via le Prisma
// Client généré) car ce fichier peut être compilé/testé dans un
// environnement où `prisma generate` n'a pas pu télécharger le moteur
// (voir audit du 2026-09-05) — le typage réel de Prisma reste identique
// en production, ceci ne fait qu'éviter une dépendance au client généré
// pour la vérification de types de cette seule méthode.
interface ExistingTreatmentAct {
  id: number;
  libelle: string;
  cout: unknown;
  montantRecu: unknown;
  remise: unknown;
}

@Injectable()
export class TreatmentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async create(cabinetId: number, userId: number, dto: CreateTreatmentDto) {
    // Vérifier que le patient appartient au cabinet
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException('Patient invalide');
    }

    // Si le soin est rattaché à un rendez-vous, vérifier qu'il appartient
    // bien au même patient (donc au même cabinet).
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
      });
      if (!appointment || appointment.patientId !== dto.patientId) {
        throw new ForbiddenException('Rendez-vous invalide');
      }
    }

    // Vérifier que les actes référencés au catalogue appartiennent au cabinet
    const acteIds = dto.acts
      .map((a) => a.acteId)
      .filter((id): id is number => !!id);
    if (acteIds.length > 0) {
      const actes = await this.prisma.actCatalog.findMany({
        where: { id: { in: acteIds } },
      });
      const uniqueIds = new Set(acteIds);
      const invalide =
        actes.length !== uniqueIds.size ||
        actes.some((a) => a.cabinetId !== cabinetId);
      if (invalide) {
        throw new ForbiddenException('Acte du catalogue invalide');
      }
    }

    // Caisse & chèques (2026-09-28) : un montant "Payé" saisi ici, à la
    // création du soin, n'existait auparavant que comme le champ
    // TreatmentAct.montantRecu — aucune ligne `Payment` n'était créée. Ce
    // paiement était donc invisible dans Caisse & chèques ET dans le
    // "Total encaissé" de Facturation/Statistiques (qui lisent tous les
    // deux la table Payment, alimentée jusqu'ici uniquement par
    // recordPayment(), c.-à-d. le bouton "Encaisser" sur un reste dû).
    // On crée maintenant une ligne Payment pour chaque acte payé dès la
    // création, avec la même sémantique que recordPayment() (mode de
    // règlement, chèque le cas échéant côté détails non collectés ici —
    // le dialogue de création n'a pas de champs N°/banque/échéance).
    return this.prisma.$transaction(async (tx) => {
      const treatment = await tx.treatment.create({
        data: {
          patientId: dto.patientId,
          appointmentId: dto.appointmentId,
          dateSoin: new Date(dto.dateSoin),
          observations: dto.observations,
          medecinId: userId,
          acts: {
            create: dto.acts.map((a) => ({
              acteId: a.acteId,
              libelle: a.libelle,
              dents: a.dents,
              cout: a.cout,
              montantRecu: a.montantRecu || 0,
              remise: a.remise || 0,
              modeReglement: a.modeReglement,
              typeSoin: a.typeSoin || 'realise',
            })),
          },
        },
        include: { acts: true, patient: true },
      });

      const actsPayes = treatment.acts.filter((a) => Number(a.montantRecu) > 0);
      if (actsPayes.length > 0) {
        await tx.payment.createMany({
          data: actsPayes.map((a) => ({
            patientId: dto.patientId,
            treatmentActId: a.id,
            montant: a.montantRecu,
            modeReglement: a.modeReglement || 'especes',
            datePaiement: new Date(dto.dateSoin),
            createdById: userId,
          })),
        });
      }

      return treatment;
    });
  }

  async update(
    cabinetId: number,
    treatmentId: number,
    dto: UpdateTreatmentDto,
    actor?: ActorContext,
  ) {
    const treatment = await this.prisma.treatment.findUnique({
      where: { id: treatmentId },
      include: { patient: true, acts: true },
    });
    if (!treatment || treatment.patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    const actsById = new Map<number, ExistingTreatmentAct>(
      treatment.acts.map((a: ExistingTreatmentAct) => [a.id, a]),
    );

    if (dto.acts) {
      const invalid = dto.acts.some((a) => !actsById.has(a.id));
      if (invalid) {
        throw new ForbiddenException('Acte invalide');
      }
    }

    // Correction de prix (cout) et/ou du montant déjà encaissé (montantRecu) :
    // les deux règles ci-dessous s'appliquent sur les valeurs FINALES (après
    // correction), pas sur les anciennes, pour que corriger les deux à la
    // fois dans la même requête fonctionne correctement.
    // 1. Le prix ne peut jamais passer sous le montant encaissé (sinon un
    //    "reste dû" négatif apparaîtrait ailleurs dans l'app — Facturation,
    //    Statistiques).
    // 2. Le montant encaissé ne peut jamais dépasser le prix moins la
    //    remise (sinon un trop-perçu apparaîtrait comme un dû négatif).
    // Si le cabinet a vraiment besoin d'aller au-delà, il doit d'abord
    // ajuster l'autre valeur.
    const costCorrections: { actId: number; libelle: string; ancienCout: number; nouveauCout: number }[] = [];
    const receivedCorrections: { actId: number; libelle: string; ancienMontant: number; nouveauMontant: number }[] = [];
    for (const a of dto.acts ?? []) {
      if (a.cout === undefined && a.montantRecu === undefined) continue;
      const existing = actsById.get(a.id)!;
      const remise = Number(existing.remise ?? 0);
      const nouveauCout = a.cout !== undefined ? a.cout : Number(existing.cout);
      const nouveauMontantRecu = a.montantRecu !== undefined ? a.montantRecu : Number(existing.montantRecu);

      if (nouveauCout < nouveauMontantRecu - 0.01) {
        throw new BadRequestException(
          `Le prix (${nouveauCout.toFixed(2)} DT) est inférieur au montant encaissé ` +
            `(${nouveauMontantRecu.toFixed(2)} DT) pour l'acte "${existing.libelle}". ` +
            `Ajustez d'abord le montant encaissé avant de baisser ce prix.`,
        );
      }
      if (nouveauMontantRecu > nouveauCout - remise + 0.01) {
        throw new BadRequestException(
          `Le montant encaissé corrigé (${nouveauMontantRecu.toFixed(2)} DT) dépasse le prix de l'acte ` +
            `${remise > 0 ? 'moins la remise ' : ''}(${(nouveauCout - remise).toFixed(2)} DT) pour l'acte "${existing.libelle}".`,
        );
      }

      if (a.cout !== undefined && a.cout !== Number(existing.cout)) {
        costCorrections.push({
          actId: a.id,
          libelle: existing.libelle,
          ancienCout: Number(existing.cout),
          nouveauCout: a.cout,
        });
      }
      if (a.montantRecu !== undefined && a.montantRecu !== Number(existing.montantRecu)) {
        receivedCorrections.push({
          actId: a.id,
          libelle: existing.libelle,
          ancienMontant: Number(existing.montantRecu),
          nouveauMontant: a.montantRecu,
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.treatment.update({
        where: { id: treatmentId },
        data: {
          ...(dto.dateSoin ? { dateSoin: new Date(dto.dateSoin) } : {}),
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
        },
      }),
      ...(dto.acts ?? []).map((a) =>
        this.prisma.treatmentAct.update({
          where: { id: a.id },
          data: {
            libelle: a.libelle,
            dents: a.dents,
            ...(a.cout !== undefined ? { cout: a.cout } : {}),
            ...(a.montantRecu !== undefined ? { montantRecu: a.montantRecu } : {}),
          },
        }),
      ),
    ]);

    // Journalisé séparément de la mise à jour générique de la séance :
    // ce sont des corrections financières sensibles (impactent le "dû"
    // affiché au patient), contrairement au renommage d'un libellé ou à
    // une correction des dents concernées.
    for (const c of costCorrections) {
      await this.auditLog.log({
        userId: actor?.userId,
        cabinetId,
        action: 'treatment_act.cout_corrected',
        entityType: 'TreatmentAct',
        entityId: c.actId,
        details: {
          treatmentId,
          libelle: c.libelle,
          ancienCout: c.ancienCout,
          nouveauCout: c.nouveauCout,
        },
        ipAddress: actor?.ipAddress,
      });
    }
    for (const c of receivedCorrections) {
      await this.auditLog.log({
        userId: actor?.userId,
        cabinetId,
        action: 'treatment_act.montant_recu_corrected',
        entityType: 'TreatmentAct',
        entityId: c.actId,
        details: {
          treatmentId,
          libelle: c.libelle,
          ancienMontant: c.ancienMontant,
          nouveauMontant: c.nouveauMontant,
        },
        ipAddress: actor?.ipAddress,
      });
    }

    return this.prisma.treatment.findUnique({
      where: { id: treatmentId },
      include: { acts: true },
    });
  }

  async findByPatient(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.treatment.findMany({
      where: { patientId },
      orderBy: { dateSoin: 'desc' },
      include: {
        // Historique des soins (2026-09-30) : on inclut les paiements de
        // chaque acte (avec leur propre datePaiement) pour que le frontend
        // puisse afficher, sous la ligne du soin, la ou les dates réelles
        // d'encaissement — qui peuvent être postérieures à dateSoin quand
        // le reste dû est réglé plus tard.
        acts: { include: { payments: { orderBy: { datePaiement: 'asc' } } } },
        medecin: { select: { nom: true, prenom: true } },
      },
    });
  }

  async getFinancialSummary(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    const result = await this.prisma.treatmentAct.aggregate({
      where: {
        treatment: { patientId },
        typeSoin: 'realise',
      },
      _sum: {
        cout: true,
        montantRecu: true,
        remise: true,
      },
    });

    const total = Number(result._sum.cout || 0);
    const recu = Number(result._sum.montantRecu || 0);
    const remise = Number(result._sum.remise || 0);
    const reste = total - recu - remise;

    return { total, recu, remise, reste };
  }

  async recordPayment(
    cabinetId: number,
    userId: number,
    actId: number,
    dto: RecordPaymentDto,
  ) {
    const act = await this.prisma.treatmentAct.findUnique({
      where: { id: actId },
      include: { treatment: { include: { patient: true } } },
    });
    if (!act || act.treatment.patient.cabinetId !== cabinetId) {
      throw new ForbiddenException('Acte invalide');
    }

    const cout = Number(act.cout);
    const remise = Number(act.remise);
    const dejaRecu = Number(act.montantRecu);
    const reste = cout - remise - dejaRecu;

    if (dto.montant > reste + 0.01) {
      throw new BadRequestException(
        `Le montant dépasse le solde dû (${reste.toFixed(2)} DT)`,
      );
    }

    const modeReglement = dto.modeReglement || act.modeReglement || 'especes';

    const [updatedAct] = await this.prisma.$transaction([
      this.prisma.treatmentAct.update({
        where: { id: actId },
        data: { montantRecu: { increment: dto.montant }, modeReglement },
      }),
      this.prisma.payment.create({
        data: {
          patientId: act.treatment.patientId,
          treatmentActId: actId,
          montant: dto.montant,
          modeReglement,
          remarque: dto.remarque,
          createdById: userId,
          ...(modeReglement === 'cheque'
            ? {
                numeroCheque: dto.numeroCheque || null,
                banque: dto.banque || null,
                dateEcheance: dto.dateEcheance ? new Date(dto.dateEcheance) : null,
              }
            : {}),
        },
      }),
    ]);

    return updatedAct;
  }

  // ==== SUPPRESSIONS (2026-10-07, demandé par Nadia) ====

  /**
   * Supprime un acte de l'historique des soins, avec ses encaissements
   * (lignes Payment) — elles disparaissent donc aussi de Caisse & chèques et
   * des totaux encaissés. Si c'était le dernier acte de la séance, la séance
   * elle-même est supprimée (sinon il resterait une ligne vide).
   * Les paiements sont supprimés explicitement avant l'acte : la clé
   * étrangère payments.treatment_act_id n'a pas de ON DELETE CASCADE.
   */
  async deleteAct(cabinetId: number, actId: number, actor?: ActorContext) {
    const act = await this.prisma.treatmentAct.findUnique({
      where: { id: actId },
      include: { treatment: { include: { patient: true } }, payments: true },
    });
    if (!act || act.treatment.patient.cabinetId !== cabinetId) {
      throw new NotFoundException('Acte introuvable');
    }

    const autresActes = await this.prisma.treatmentAct.count({
      where: { treatmentId: act.treatmentId, id: { not: actId } },
    });
    const seanceSupprimee = autresActes === 0;

    await this.prisma.$transaction([
      this.prisma.payment.deleteMany({ where: { treatmentActId: actId } }),
      this.prisma.treatmentAct.delete({ where: { id: actId } }),
      ...(seanceSupprimee
        ? [this.prisma.treatment.delete({ where: { id: act.treatmentId } })]
        : []),
    ]);

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'treatment_act.deleted',
      entityType: 'TreatmentAct',
      entityId: actId,
      details: {
        treatmentId: act.treatmentId,
        patientId: act.treatment.patientId,
        libelle: act.libelle,
        dents: act.dents,
        cout: Number(act.cout),
        montantRecu: Number(act.montantRecu),
        paiementsSupprimes: act.payments.map((p) => ({
          id: p.id,
          montant: Number(p.montant),
          modeReglement: p.modeReglement,
          datePaiement: p.datePaiement,
        })),
        seanceSupprimee,
      },
      ipAddress: actor?.ipAddress,
    });

    return { success: true, seanceSupprimee };
  }

  /**
   * Supprime un seul encaissement (ligne « ↳ Encaissement ») et retire son
   * montant du « Payé » de l'acte concerné — le reste dû remonte d'autant.
   */
  async deletePayment(cabinetId: number, paymentId: number, actor?: ActorContext) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { patient: true, treatmentAct: true },
    });
    if (!payment || payment.patient.cabinetId !== cabinetId) {
      throw new NotFoundException('Encaissement introuvable');
    }

    const montant = Number(payment.montant);
    const ancienMontantRecu = payment.treatmentAct ? Number(payment.treatmentAct.montantRecu) : null;
    const nouveauMontantRecu =
      ancienMontantRecu !== null ? Math.max(0, ancienMontantRecu - montant) : null;

    await this.prisma.$transaction([
      this.prisma.payment.delete({ where: { id: paymentId } }),
      ...(payment.treatmentActId && nouveauMontantRecu !== null
        ? [
            this.prisma.treatmentAct.update({
              where: { id: payment.treatmentActId },
              data: { montantRecu: nouveauMontantRecu },
            }),
          ]
        : []),
    ]);

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'payment.deleted',
      entityType: 'Payment',
      entityId: paymentId,
      details: {
        patientId: payment.patientId,
        treatmentActId: payment.treatmentActId,
        montant,
        modeReglement: payment.modeReglement,
        numeroCheque: payment.numeroCheque,
        datePaiement: payment.datePaiement,
        ancienMontantRecu,
        nouveauMontantRecu,
      },
      ipAddress: actor?.ipAddress,
    });

    return { success: true };
  }

  // ==== SCHÉMA DENTAIRE ====

  async getToothChart(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.toothState.findMany({
      where: { patientId },
      orderBy: { dentNumero: 'asc' },
    });
  }

  async upsertToothState(
    cabinetId: number,
    userId: number,
    patientId: number,
    dto: UpdateToothStateDto,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.toothState.upsert({
      where: {
        patientId_dentNumero: { patientId, dentNumero: dto.dentNumero },
      },
      update: {
        etat: dto.etat,
        notes: dto.notes,
        modifiedById: userId,
        dateModif: new Date(),
      },
      create: {
        patientId,
        dentNumero: dto.dentNumero,
        etat: dto.etat,
        notes: dto.notes,
        modifiedById: userId,
      },
    });
  }
}
