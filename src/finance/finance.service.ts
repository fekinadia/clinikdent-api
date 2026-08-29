import { Injectable } from '@nestjs/common';
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
}
