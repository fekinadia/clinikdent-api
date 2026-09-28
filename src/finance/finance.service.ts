import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async getOverview(cabinetId: number, months: number) {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const payments = await this.prisma.payment.findMany({
      where: { patient: { cabinetId }, datePaiement: { gte: since } },
      select: { montant: true },
    });
    const totalEncaisse = payments.reduce((sum, p) => sum + Number(p.montant), 0);

    const acts = await this.prisma.treatmentAct.findMany({
      where: { typeSoin: 'realise', treatment: { patient: { cabinetId } } },
      select: {
        cout: true,
        montantRecu: true,
        remise: true,
        treatment: { select: { patientId: true } },
      },
    });

    const restePerPatient = new Map<number, number>();
    for (const act of acts) {
      const reste = Number(act.cout) - Number(act.montantRecu) - Number(act.remise);
      const patientId = act.treatment.patientId;
      restePerPatient.set(patientId, (restePerPatient.get(patientId) || 0) + reste);
    }

    let totalImpaye = 0;
    let nbPatientsImpaye = 0;
    for (const reste of restePerPatient.values()) {
      if (reste > 0) {
        totalImpaye += reste;
        nbPatientsImpaye += 1;
      }
    }

    return {
      totalEncaisse: round(totalEncaisse),
      totalImpaye: round(totalImpaye),
      nbPatientsImpaye,
    };
  }

  async listUnpaid(cabinetId: number) {
    const acts = await this.prisma.treatmentAct.findMany({
      where: { typeSoin: 'realise', treatment: { patient: { cabinetId } } },
      select: {
        cout: true,
        montantRecu: true,
        remise: true,
        treatment: {
          select: {
            patientId: true,
            patient: {
              select: { id: true, nom: true, prenom: true, gsm: true, numeroDossier: true },
            },
          },
        },
      },
    });

    const byPatient = new Map<
      number,
      { patient: { id: number; nom: string; prenom: string; gsm: string | null; numeroDossier: string }; total: number; recu: number; remise: number }
    >();

    for (const act of acts) {
      const patient = act.treatment.patient;
      const entry = byPatient.get(patient.id) || { patient, total: 0, recu: 0, remise: 0 };
      entry.total += Number(act.cout);
      entry.recu += Number(act.montantRecu);
      entry.remise += Number(act.remise);
      byPatient.set(patient.id, entry);
    }

    return Array.from(byPatient.values())
      .map((e) => ({
        patientId: e.patient.id,
        nom: e.patient.nom,
        prenom: e.patient.prenom,
        gsm: e.patient.gsm,
        numeroDossier: e.patient.numeroDossier,
        total: round(e.total),
        recu: round(e.recu),
        remise: round(e.remise),
        reste: round(e.total - e.recu - e.remise),
      }))
      .filter((e) => e.reste > 0)
      .sort((a, b) => b.reste - a.reste);
  }

  async listPayments(cabinetId: number, from?: string, to?: string, patientId?: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { patient: { cabinetId } };

    if (from || to) {
      where.datePaiement = {};
      if (from) where.datePaiement.gte = new Date(from);
      if (to) where.datePaiement.lte = new Date(to);
    }
    if (patientId) {
      where.patientId = patientId;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { datePaiement: 'desc' },
      select: {
        id: true,
        montant: true,
        modeReglement: true,
        datePaiement: true,
        patient: { select: { id: true, nom: true, prenom: true, numeroDossier: true } },
      },
    });

    return payments.map((p) => ({
      id: p.id,
      montant: Number(p.montant),
      modeReglement: p.modeReglement,
      datePaiement: p.datePaiement,
      patientId: p.patient.id,
      nomPatient: p.patient.nom,
      prenomPatient: p.patient.prenom,
      numeroDossier: p.patient.numeroDossier,
    }));
  }

  // ==== CAISSE & CHÈQUES (2026-09-27) ====

  /**
   * Journal de caisse d'une journée : tous les encaissements dont la date de
   * paiement est `date` (YYYY-MM-DD), avec les totaux par mode de règlement.
   */
  async getCaisse(cabinetId: number, date: string) {
    const jour = new Date(`${date}T00:00:00.000Z`);
    const payments = await this.prisma.payment.findMany({
      where: { patient: { cabinetId }, datePaiement: jour },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        montant: true,
        modeReglement: true,
        numeroCheque: true,
        banque: true,
        dateEcheance: true,
        dateEncaissement: true,
        createdAt: true,
        patient: { select: { id: true, nom: true, prenom: true, numeroDossier: true } },
        treatmentAct: { select: { libelle: true } },
        createdBy: { select: { prenom: true, nom: true } },
      },
    });

    const parMode: Record<string, number> = {};
    let total = 0;
    for (const p of payments) {
      const m = Number(p.montant);
      total += m;
      parMode[p.modeReglement] = round((parMode[p.modeReglement] || 0) + m);
    }

    return {
      date,
      total: round(total),
      nombre: payments.length,
      parMode,
      paiements: payments.map((p) => ({
        id: p.id,
        heure: p.createdAt,
        montant: Number(p.montant),
        modeReglement: p.modeReglement,
        numeroCheque: p.numeroCheque,
        banque: p.banque,
        dateEcheance: p.dateEcheance,
        dateEncaissement: p.dateEncaissement,
        acte: p.treatmentAct?.libelle ?? null,
        patientId: p.patient.id,
        nomPatient: p.patient.nom,
        prenomPatient: p.patient.prenom,
        numeroDossier: p.patient.numeroDossier,
        encaissePar: p.createdBy ? `${p.createdBy.prenom} ${p.createdBy.nom}` : null,
      })),
    };
  }

  /**
   * Suivi des chèques reçus. « En attente » = pas encore de date
   * d'encaissement. Tri : les échéances les plus proches d'abord (les
   * chèques sans échéance, encaissables tout de suite, en tête).
   */
  async listCheques(cabinetId: number, statut: 'en_attente' | 'encaisse' | 'tous' = 'en_attente') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { patient: { cabinetId }, modeReglement: 'cheque' };
    if (statut === 'en_attente') where.dateEncaissement = null;
    if (statut === 'encaisse') where.dateEncaissement = { not: null };

    const cheques = await this.prisma.payment.findMany({
      where,
      orderBy:
        statut === 'encaisse'
          ? [{ dateEncaissement: 'desc' }]
          : [{ dateEcheance: { sort: 'asc', nulls: 'first' } }, { datePaiement: 'asc' }],
      select: {
        id: true,
        montant: true,
        numeroCheque: true,
        banque: true,
        dateEcheance: true,
        dateEncaissement: true,
        datePaiement: true,
        patient: { select: { id: true, nom: true, prenom: true, numeroDossier: true } },
      },
    });

    const items = cheques.map((c) => ({
      id: c.id,
      montant: Number(c.montant),
      numeroCheque: c.numeroCheque,
      banque: c.banque,
      dateEcheance: c.dateEcheance,
      dateEncaissement: c.dateEncaissement,
      datePaiement: c.datePaiement,
      patientId: c.patient.id,
      nomPatient: c.patient.nom,
      prenomPatient: c.patient.prenom,
      numeroDossier: c.patient.numeroDossier,
    }));
    const totalEnAttente = round(
      items.filter((c) => !c.dateEncaissement).reduce((s, c) => s + c.montant, 0),
    );
    return { total: round(items.reduce((s, c) => s + c.montant, 0)), totalEnAttente, cheques: items };
  }

  /**
   * Marque un chèque comme encaissé (date du jour par défaut) ou annule
   * l'encaissement (erreur de clic). Isolation cabinet stricte, 404 si le
   * paiement n'existe pas, n'est pas un chèque ou appartient à un autre cabinet.
   */
  async setChequeEncaisse(cabinetId: number, paymentId: number, encaisse: boolean, date?: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, modeReglement: true, patient: { select: { cabinetId: true } } },
    });
    if (!p || p.patient.cabinetId !== cabinetId || p.modeReglement !== 'cheque') {
      throw new NotFoundException('Chèque introuvable');
    }
    const today = new Date().toISOString().slice(0, 10);
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { dateEncaissement: encaisse ? new Date(`${date || today}T00:00:00.000Z`) : null },
      select: { id: true, dateEncaissement: true },
    });
    return updated;
  }
}
