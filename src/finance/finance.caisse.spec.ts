import { NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';

function makeService() {
  const prisma = {
    payment: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  } as any;
  return { service: new FinanceService(prisma), prisma };
}

const patient = { id: 7, nom: 'Ben Salah', prenom: 'Amine', numeroDossier: '0007' };

describe('FinanceService — caisse du jour', () => {
  it('filtre par cabinet et par jour, et totalise par mode de règlement', async () => {
    const { service, prisma } = makeService();
    prisma.payment.findMany.mockResolvedValue([
      { id: 1, montant: 50, modeReglement: 'especes', createdAt: new Date(), patient, treatmentAct: { libelle: 'Détartrage' }, createdBy: null },
      { id: 2, montant: 120.5, modeReglement: 'cheque', numeroCheque: '123', createdAt: new Date(), patient, treatmentAct: null, createdBy: { prenom: 'N', nom: 'F' } },
      { id: 3, montant: 30, modeReglement: 'especes', createdAt: new Date(), patient, treatmentAct: null, createdBy: null },
    ]);
    const r = await service.getCaisse(3, '2026-09-27');
    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect(where.patient).toEqual({ cabinetId: 3 });
    expect(where.datePaiement.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(r.total).toBe(200.5);
    expect(r.nombre).toBe(3);
    expect(r.parMode).toEqual({ especes: 80, cheque: 120.5 });
    expect(r.paiements[0].acte).toBe('Détartrage');
    expect(r.paiements[1].encaissePar).toBe('N F');
  });
});

describe('FinanceService — chèques', () => {
  it('en attente = chèques sans date d\'encaissement du cabinet', async () => {
    const { service, prisma } = makeService();
    prisma.payment.findMany.mockResolvedValue([
      { id: 2, montant: 100, dateEncaissement: null, patient },
      { id: 3, montant: 40, dateEncaissement: null, patient },
    ]);
    const r = await service.listCheques(3, 'en_attente');
    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ patient: { cabinetId: 3 }, modeReglement: 'cheque', dateEncaissement: null });
    expect(r.totalEnAttente).toBe(140);
    expect(r.cheques).toHaveLength(2);
  });

  it('marque un chèque encaissé à la date donnée', async () => {
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValue({ id: 2, modeReglement: 'cheque', patient: { cabinetId: 3 } });
    prisma.payment.update.mockResolvedValue({ id: 2 });
    await service.setChequeEncaisse(3, 2, true, '2026-10-01');
    expect(prisma.payment.update.mock.calls[0][0].data.dateEncaissement.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it("annule l'encaissement", async () => {
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValue({ id: 2, modeReglement: 'cheque', patient: { cabinetId: 3 } });
    prisma.payment.update.mockResolvedValue({ id: 2 });
    await service.setChequeEncaisse(3, 2, false);
    expect(prisma.payment.update.mock.calls[0][0].data.dateEncaissement).toBeNull();
  });

  it("refuse (404) un chèque d'un autre cabinet ou un paiement qui n'est pas un chèque", async () => {
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValueOnce({ id: 2, modeReglement: 'cheque', patient: { cabinetId: 99 } });
    await expect(service.setChequeEncaisse(3, 2, true)).rejects.toBeInstanceOf(NotFoundException);
    prisma.payment.findUnique.mockResolvedValueOnce({ id: 4, modeReglement: 'especes', patient: { cabinetId: 3 } });
    await expect(service.setChequeEncaisse(3, 4, true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
