import { NotFoundException } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';

// Suppression d'un acte / d'un encaissement depuis l'historique des soins
// (2026-10-07, demandé par Nadia).

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    treatment: { delete: jest.fn((a) => ({ op: 'treatment.delete', ...a })) },
    treatmentAct: {
      findUnique: jest.fn(),
      count: jest.fn(),
      delete: jest.fn((a) => ({ op: 'treatmentAct.delete', ...a })),
      update: jest.fn((a) => ({ op: 'treatmentAct.update', ...a })),
    },
    payment: {
      findUnique: jest.fn(),
      delete: jest.fn((a) => ({ op: 'payment.delete', ...a })),
      deleteMany: jest.fn((a) => ({ op: 'payment.deleteMany', ...a })),
    },
    $transaction: jest.fn(async (ops: any[]) => ops),
  } as any;
  const auditLog = { log: jest.fn() } as any;
  return { service: new TreatmentsService(prisma, auditLog), prisma, auditLog };
}

const actOf = (cabinetId: number, extra: any = {}) => ({
  id: 31,
  treatmentId: 3,
  libelle: 'Détartrage',
  dents: null,
  cout: 220,
  montantRecu: 120,
  treatment: { patientId: 9, patient: { cabinetId } },
  payments: [
    { id: 501, montant: 60, modeReglement: 'especes', datePaiement: new Date('2026-10-01') },
    { id: 502, montant: 60, modeReglement: 'especes', datePaiement: new Date('2026-10-07') },
  ],
  ...extra,
});

describe('TreatmentsService.deleteAct', () => {
  it("supprime les encaissements puis l'acte, et garde la séance s'il reste d'autres actes", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.treatmentAct.findUnique.mockResolvedValue(actOf(CABINET_A));
    prisma.treatmentAct.count.mockResolvedValue(2);

    const res = await service.deleteAct(CABINET_A, 31, { userId: 7 });

    const ops = prisma.$transaction.mock.calls[0][0];
    expect(ops.map((o: any) => o.op)).toEqual(['payment.deleteMany', 'treatmentAct.delete']);
    expect(prisma.payment.deleteMany).toHaveBeenCalledWith({ where: { treatmentActId: 31 } });
    expect(prisma.treatment.delete).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, seanceSupprimee: false });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'treatment_act.deleted', entityId: 31 }),
    );
  });

  it("supprime aussi la séance quand c'était son dernier acte", async () => {
    const { service, prisma } = makeService();
    prisma.treatmentAct.findUnique.mockResolvedValue(actOf(CABINET_A));
    prisma.treatmentAct.count.mockResolvedValue(0);

    const res = await service.deleteAct(CABINET_A, 31);

    const ops = prisma.$transaction.mock.calls[0][0];
    expect(ops.map((o: any) => o.op)).toEqual([
      'payment.deleteMany',
      'treatmentAct.delete',
      'treatment.delete',
    ]);
    expect(prisma.treatment.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(res.seanceSupprimee).toBe(true);
  });

  it("refuse (404) un acte d'un autre cabinet, sans rien supprimer", async () => {
    const { service, prisma } = makeService();
    prisma.treatmentAct.findUnique.mockResolvedValue(actOf(CABINET_B));

    await expect(service.deleteAct(CABINET_A, 31)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse (404) un acte inexistant', async () => {
    const { service, prisma } = makeService();
    prisma.treatmentAct.findUnique.mockResolvedValue(null);
    await expect(service.deleteAct(CABINET_A, 999)).rejects.toThrow(NotFoundException);
  });
});

describe('TreatmentsService.deletePayment', () => {
  const paymentOf = (cabinetId: number, extra: any = {}) => ({
    id: 502,
    patientId: 9,
    treatmentActId: 31,
    montant: 60,
    modeReglement: 'especes',
    numeroCheque: null,
    datePaiement: new Date('2026-10-07'),
    patient: { cabinetId },
    treatmentAct: { id: 31, montantRecu: 120 },
    ...extra,
  });

  it("supprime l'encaissement et retire son montant du « Payé » de l'acte", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.payment.findUnique.mockResolvedValue(paymentOf(CABINET_A));

    await service.deletePayment(CABINET_A, 502, { userId: 7 });

    expect(prisma.payment.delete).toHaveBeenCalledWith({ where: { id: 502 } });
    expect(prisma.treatmentAct.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { montantRecu: 60 },
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment.deleted', entityId: 502 }),
    );
  });

  it('ne fait jamais passer le « Payé » sous zéro', async () => {
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValue(
      paymentOf(CABINET_A, { montant: 80, treatmentAct: { id: 31, montantRecu: 50 } }),
    );

    await service.deletePayment(CABINET_A, 502);

    expect(prisma.treatmentAct.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { montantRecu: 0 },
    });
  });

  it("refuse (404) un encaissement d'un autre cabinet", async () => {
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValue(paymentOf(CABINET_B));

    await expect(service.deletePayment(CABINET_A, 502)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
