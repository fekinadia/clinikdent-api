import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// STEP 4 — 'no_show' est désormais le statut officiel pour les rendez-vous
// manqués (voir audit du 2026-09-06) ; 'absent' reste conservé pour
// l'historique (anciens RDV) mais n'est plus utilisé pour de nouveaux
// enregistrements. Les deux sont suivis séparément ci-dessous afin de ne
// pas fausser les statistiques historiques déjà basées sur 'absent'.
const STATUTS = [
  'planifie',
  'confirme',
  'en_cours',
  'termine',
  'annule',
  'absent',
  'no_show',
] as const;
type Statut = (typeof STATUTS)[number];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthRange(months: number): { since: Date; keys: string[] } {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    keys.push(monthKey(d));
  }
  return { since, keys };
}

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(cabinetId: number, months: number) {
    const { since, keys } = buildMonthRange(months);

    const [totalPatients, newPatients, appointments, payments, treatmentActs] =
      await Promise.all([
        this.prisma.patient.count({ where: { cabinetId } }),
        this.prisma.patient.findMany({
          where: { cabinetId, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        this.prisma.appointment.findMany({
          where: { cabinetId, dateDebut: { gte: since } },
          select: { dateDebut: true, statut: true },
        }),
        this.prisma.payment.findMany({
          where: { patient: { cabinetId }, datePaiement: { gte: since } },
          select: { datePaiement: true, montant: true },
        }),
        this.prisma.treatmentAct.findMany({
          where: {
            createdAt: { gte: since },
            treatment: { patient: { cabinetId } },
          },
          select: { libelle: true },
        }),
      ]);

    const patientsParMoisMap = new Map<string, number>();
    for (const k of keys) patientsParMoisMap.set(k, 0);
    for (const p of newPatients) {
      const k = monthKey(p.createdAt);
      if (patientsParMoisMap.has(k)) {
        patientsParMoisMap.set(k, (patientsParMoisMap.get(k) || 0) + 1);
      }
    }

    type RdvBucket = { total: number } & Record<Statut, number>;
    const rdvParMoisMap = new Map<string, RdvBucket>();
    for (const k of keys) {
      rdvParMoisMap.set(k, {
        total: 0,
        planifie: 0,
        confirme: 0,
        en_cours: 0,
        termine: 0,
        annule: 0,
        absent: 0,
        no_show: 0,
      });
    }
    let totalRdv = 0;
    let totalAbsents = 0;
    let totalNoShows = 0;
    let totalConfirmesOuTermines = 0;
    for (const a of appointments) {
      const k = monthKey(a.dateDebut);
      const bucket = rdvParMoisMap.get(k);
      const statut = (a.statut as Statut) || 'planifie';
      if (bucket) {
        bucket.total += 1;
        if (STATUTS.includes(statut)) bucket[statut] += 1;
      }
      totalRdv += 1;
      // 'absent' (historique) et 'no_show' (officiel depuis STEP 4) sont
      // comptabilisés séparément pour ne pas fausser tauxAbsence, mais tous
      // deux contribuent au nouveau tauxNoShow (rendez-vous manqués, quel
      // que soit le libellé historique du statut).
      if (statut === 'absent') totalAbsents += 1;
      if (statut === 'no_show') totalNoShows += 1;
      if (statut === 'confirme' || statut === 'termine') totalConfirmesOuTermines += 1;
    }

    const recettesParMoisMap = new Map<string, number>();
    for (const k of keys) recettesParMoisMap.set(k, 0);
    let totalRecettes = 0;
    for (const p of payments) {
      const montant = Number(p.montant);
      totalRecettes += montant;
      const k = monthKey(p.datePaiement);
      if (recettesParMoisMap.has(k)) {
        recettesParMoisMap.set(k, (recettesParMoisMap.get(k) || 0) + montant);
      }
    }

    const actesCount = new Map<string, number>();
    for (const t of treatmentActs) {
      actesCount.set(t.libelle, (actesCount.get(t.libelle) || 0) + 1);
    }
    const actesFrequents = [...actesCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([libelle, count]) => ({ libelle, count }));

    return {
      periode: { mois: months, depuis: since.toISOString().slice(0, 10) },
      patients: {
        total: totalPatients,
        parMois: keys.map((mois) => ({ mois, nouveaux: patientsParMoisMap.get(mois) || 0 })),
      },
      rendezVous: {
        parMois: keys.map((mois) => ({ mois, ...(rdvParMoisMap.get(mois) as RdvBucket) })),
        // Historique : conservé tel quel (basé sur l'ancien statut 'absent'
        // uniquement) pour ne pas modifier rétroactivement une statistique
        // déjà consommée par le frontend existant.
        tauxAbsence: totalRdv > 0 ? Math.round((totalAbsents / totalRdv) * 1000) / 10 : 0,
        // STEP 4 — taux de rendez-vous manqués basé sur le statut officiel
        // 'no_show'. À ne pas confondre avec tauxAbsence (legacy) : un même
        // rendez-vous n'est jamais compté dans les deux (statuts distincts).
        tauxNoShow: totalRdv > 0 ? Math.round((totalNoShows / totalRdv) * 1000) / 10 : 0,
        // Vue combinée pratique pour le dashboard : tout rendez-vous manqué,
        // qu'il ait été enregistré avant (statut 'absent') ou après (statut
        // 'no_show') la mise en place de la détection automatique STEP 4.
        tauxAbsenceGlobal:
          totalRdv > 0 ? Math.round(((totalAbsents + totalNoShows) / totalRdv) * 1000) / 10 : 0,
        tauxConfirmation:
          totalRdv > 0 ? Math.round((totalConfirmesOuTermines / totalRdv) * 1000) / 10 : 0,
      },
      recettes: {
        total: Math.round(totalRecettes * 1000) / 1000,
        parMois: keys.map((mois) => ({
          mois,
          montant: Math.round((recettesParMoisMap.get(mois) || 0) * 1000) / 1000,
        })),
      },
      actesFrequents,
    };
  }

  /**
   * STEP 4 — vue d'ensemble de l'automatisation no-show, destinée à
   * remplacer le placeholder « Bientôt disponible » de AutomationOverviewPage.
   * Ajoutée à StatisticsService (plutôt qu'un nouveau sous-système) pour
   * réutiliser l'architecture de statistiques existante, comme demandé.
   * Compteurs cumulés (toutes périodes confondues), isolés par cabinet via
   * la relation appointment.cabinetId — NoShowRecovery n'a pas de
   * cabinetId propre.
   */
  async getAutomationOverview(cabinetId: number) {
    const [totalNoShows, enAttente, recupere, perdu, annule] = await Promise.all([
      this.prisma.appointment.count({ where: { cabinetId, statut: 'no_show' } }),
      this.prisma.noShowRecovery.count({
        where: { appointment: { cabinetId }, statut: 'en_attente' },
      }),
      this.prisma.noShowRecovery.count({
        where: { appointment: { cabinetId }, statut: 'recupere' },
      }),
      this.prisma.noShowRecovery.count({
        where: { appointment: { cabinetId }, statut: 'perdu' },
      }),
      this.prisma.noShowRecovery.count({
        where: { appointment: { cabinetId }, statut: 'annule' },
      }),
    ]);

    return {
      noShows: totalNoShows,
      relances: {
        enAttente,
        recupere,
        perdu,
        // Relances annulées automatiquement suite à une correction de statut
        // (voir handleAppointmentNoShowCorrected) — informatif, pas un échec.
        annule,
      },
    };
  }
}
