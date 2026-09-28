import { TreatmentsService } from './treatments.service';

function setup() {
  const prisma = {
    treatmentAct: {
      findUnique: jest.fn().mockResolvedValue({
        id: 5, cout: 200, remise: 0, montantRecu: 0, modeReglement: null,
        treatment: { patientId: 7, patient: { cabinetId: 3 } },
      }),
      update: jest.fn().mockReturnValue('actUpdate'),
    },
    payment: { create: jest.fn().mockReturnValue('paymentCreate') },
    $transaction: jest.fn().mockResolvedValue([{ id: 5 }]),
  } as any;
  const service = new TreatmentsService(prisma, { log: jest.fn() } as any);
  return { service, prisma };
}

describe('TreatmentsService.recordPayment — infos chèque (Caisse, 2026-09-27)', () => {
  it('enregistre numéro, banque et échéance pour un paiement par chèque', async () => {
    const { service, prisma } = setup();
    await service.recordPayment(3, 1, 5, {
      montant: 100, modeReglement: 'cheque', numeroCheque: '0012345', banque: 'BIAT', dateEcheance: '2026-10-15',
    });
    const data = prisma.payment.create.mock.calls[0][0].data;
    expect(data.numeroCheque).toBe('0012345');
    expect(data.banque).toBe('BIAT');
    expect(data.dateEcheance.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it("ignore les champs chèque pour un paiement en espèces", async () => {
    const { service, prisma } = setup();
    await service.recordPayment(3, 1, 5, { montant: 50, modeReglement: 'especes', numeroCheque: 'x', banque: 'y' });
    const data = prisma.payment.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('numeroCheque');
    expect(data).not.toHaveProperty('banque');
  });
});
