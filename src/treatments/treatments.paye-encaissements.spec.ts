import { BadRequestException } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';

// Correction du « Payé » au crayon (2026-10-29) : impossible de descendre
// sous les encaissements déjà enregistrés pour l'acte (cas réel : couronne
// payée 60 DT le 07/10 puis remise à 0, la Caisse gardait les 60 DT).

const CABINET_A = 1;

function makeService(acts: any[]) {
  const prisma = {
    treatment: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 3, patient: { cabinetId: CABINET_A }, acts })
        .mockResolvedValue({ id: 3, acts }),
      update: jest.fn((a) => ({ op: 'treatment.update', ...a })),
    },
    treatmentAct: { update: jest.fn((a) => ({ op: 'treatmentAct.update', ...a })) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  } as any;
  const auditLog = { log: jest.fn() } as any;
  return { service: new TreatmentsService(prisma, auditLog), prisma, auditLog };
}

const couronne = (extra: any = {}) => ({
  id: 31,
  libelle: 'Couronne céramo-métallique',
  cout: 600,
  montantRecu: 60,
  remise: 0,
  payments: [{ montant: 60 }],
  ...extra,
});

describe('TreatmentsService.update — « Payé » et encaissements enregistrés', () => {
  it("refuse de baisser le payé sous les encaissements (60 → 0), sans rien modifier", async () => {
    const { service, prisma, auditLog } = makeService([couronne()]);

    await expect(
      service.update(CABINET_A, 3, { acts: [{ id: 31, libelle: 'Couronne céramo-métallique', montantRecu: 0 }] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('le message explique de supprimer l’encaissement plutôt que de baisser le montant', async () => {
    const { service } = makeService([couronne()]);
    await expect(
      service.update(CABINET_A, 3, { acts: [{ id: 31, libelle: 'Couronne céramo-métallique', montantRecu: 20 }] } as any),
    ).rejects.toThrow(/supprimez-le/);
  });

  it('accepte une correction égale ou supérieure aux encaissements (60 → 100)', async () => {
    const { service, prisma } = makeService([couronne()]);
    await service.update(CABINET_A, 3, { acts: [{ id: 31, libelle: 'Couronne céramo-métallique', montantRecu: 100 }] } as any);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("ne bloque pas un acte déjà incohérent quand son payé n'est pas modifié (autre champ corrigé)", async () => {
    // Payé 0 mais 60 DT encaissés (données d'avant ce correctif) : renommer l'acte doit rester possible.
    const { service, prisma } = makeService([couronne({ montantRecu: 0 })]);
    await service.update(CABINET_A, 3, { acts: [{ id: 31, libelle: 'Couronne', montantRecu: 0 }] } as any);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('accepte un acte sans aucun encaissement enregistré (anciens soins)', async () => {
    const { service, prisma } = makeService([couronne({ montantRecu: 80, payments: [] })]);
    await service.update(CABINET_A, 3, { acts: [{ id: 31, libelle: 'Couronne céramo-métallique', montantRecu: 50 }] } as any);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
