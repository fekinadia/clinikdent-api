import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    patient: { findUnique: jest.fn() },
    appointment: { findUnique: jest.fn() },
    actCatalog: { findMany: jest.fn() },
    treatment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    treatmentAct: { update: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as any;
  const auditLog = { log: jest.fn() } as any;
  const service = new TreatmentsService(prisma, auditLog);
  return { service, prisma, auditLog };
}

/**
 * Intégration catalogue <-> soins (STEP 3, point 5) : TreatmentAct.acteId
 * et sa validation de cabinet existaient déjà avant STEP 3 — ces tests
 * confirment le comportement, pas une nouvelle implémentation, en
 * particulier la règle "le catalogue ne fournit qu'un prix par défaut,
 * jamais une référence vivante" (point 4/5 du plan validé).
 */
describe('TreatmentsService — intégration avec le catalogue des actes', () => {
  it('crée un soin en référençant un acte actif du catalogue du même cabinet, en gardant le prix saisi par le clinicien', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({ id: 5, cabinetId: CABINET_A });
    prisma.actCatalog.findMany.mockResolvedValue([
      { id: 10, cabinetId: CABINET_A, libelle: 'Détartrage', tarifBase: 90 },
    ]);
    prisma.treatment.create.mockResolvedValue({ id: 1 });

    await service.create(CABINET_A, 7, {
      patientId: 5,
      dateSoin: '2026-09-05',
      // Le clinicien a modifié le prix par rapport au tarif par défaut
      // du catalogue (90) — le catalogue ne fournit qu'une suggestion.
      acts: [{ acteId: 10, libelle: 'Détartrage', cout: 75 }],
    } as any);

    expect(prisma.treatment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acts: {
            create: [
              expect.objectContaining({ acteId: 10, libelle: 'Détartrage', cout: 75 }),
            ],
          },
        }),
      }),
    );
  });

  it("rejette un acteId appartenant à un autre cabinet", async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({ id: 5, cabinetId: CABINET_A });
    prisma.actCatalog.findMany.mockResolvedValue([
      { id: 10, cabinetId: CABINET_B, libelle: 'Détartrage', tarifBase: 90 },
    ]);

    await expect(
      service.create(CABINET_A, 7, {
        patientId: 5,
        dateSoin: '2026-09-05',
        acts: [{ acteId: 10, libelle: 'Détartrage', cout: 90 }],
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.treatment.create).not.toHaveBeenCalled();
  });

  it('crée un soin sans acteId (compatibilité historique, catalogue non utilisé)', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({ id: 5, cabinetId: CABINET_A });
    prisma.treatment.create.mockResolvedValue({ id: 2 });

    await service.create(CABINET_A, 7, {
      patientId: 5,
      dateSoin: '2026-09-05',
      acts: [{ libelle: 'Consultation libre', cout: 30 }],
    } as any);

    // Aucun acteId fourni : le catalogue n'est même pas consulté.
    expect(prisma.actCatalog.findMany).not.toHaveBeenCalled();
    expect(prisma.treatment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acts: {
            create: [expect.objectContaining({ acteId: undefined, libelle: 'Consultation libre', cout: 30 })],
          },
        }),
      }),
    );
  });
});

/**
 * Correction du prix d'un acte après coup (demande de Nadia, 2026-09-11 :
 * aucune interface n'existait pour corriger une erreur de saisie sur le
 * prix d'un soin déjà créé — le formulaire "Modifier" existant exclut
 * volontairement coût/montant reçu/mode de règlement depuis le 2026-08-31,
 * ce qui restait correct pour le paiement mais bloquait toute correction
 * légitime du prix lui-même). Règle validée avec Nadia : la correction est
 * refusée si elle ferait passer le prix sous le montant déjà encaissé.
 */
describe('TreatmentsService.update — correction de prix (cout)', () => {
  function mockExistingTreatment(prisma: any, act: { id: number; libelle: string; cout: number; montantRecu: number }) {
    const treatment = {
      id: 1,
      patient: { cabinetId: CABINET_A },
      acts: [act],
    };
    prisma.treatment.findUnique.mockResolvedValueOnce(treatment); // lecture initiale
    prisma.treatment.findUnique.mockResolvedValueOnce({ ...treatment }); // relecture finale
    prisma.treatment.update.mockResolvedValue({ id: 1 });
    prisma.treatmentAct.update.mockResolvedValue({ id: act.id });
    return treatment;
  }

  it('accepte une correction de prix supérieure ou égale au montant déjà encaissé', async () => {
    const { service, prisma, auditLog } = makeService();
    mockExistingTreatment(prisma, { id: 42, libelle: 'Détartrage', cout: 100, montantRecu: 90 });

    await service.update(
      CABINET_A,
      1,
      { acts: [{ id: 42, libelle: 'Détartrage', cout: 110 }] } as any,
      { userId: 7, ipAddress: '127.0.0.1' },
    );

    expect(prisma.treatmentAct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({ cout: 110 }),
      }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'treatment_act.cout_corrected',
        entityType: 'TreatmentAct',
        entityId: 42,
        userId: 7,
        details: expect.objectContaining({ ancienCout: 100, nouveauCout: 110 }),
      }),
    );
  });

  it('refuse une correction de prix inférieure au montant déjà encaissé (évite un "dû" négatif)', async () => {
    const { service, prisma, auditLog } = makeService();
    mockExistingTreatment(prisma, { id: 42, libelle: 'Détartrage', cout: 100, montantRecu: 90 });

    await expect(
      service.update(
        CABINET_A,
        1,
        { acts: [{ id: 42, libelle: 'Détartrage', cout: 80 }] } as any,
        { userId: 7 },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('accepte exactement le montant déjà encaissé comme nouveau prix (reste dû = 0, cas limite)', async () => {
    const { service, prisma } = makeService();
    mockExistingTreatment(prisma, { id: 42, libelle: 'Détartrage', cout: 100, montantRecu: 90 });

    await expect(
      service.update(
        CABINET_A,
        1,
        { acts: [{ id: 42, libelle: 'Détartrage', cout: 90 }] } as any,
        { userId: 7 },
      ),
    ).resolves.toBeDefined();
  });

  it("ne journalise rien et n'envoie pas cout à Prisma si le prix n'est pas modifié (seuls libellé/dents changent)", async () => {
    const { service, prisma, auditLog } = makeService();
    mockExistingTreatment(prisma, { id: 42, libelle: 'Détartrage', cout: 100, montantRecu: 90 });

    await service.update(
      CABINET_A,
      1,
      { acts: [{ id: 42, libelle: 'Détartrage (bas)', dents: '36;37' }] } as any,
      { userId: 7 },
    );

    expect(prisma.treatmentAct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { libelle: 'Détartrage (bas)', dents: '36;37' },
      }),
    );
    expect(auditLog.log).not.toHaveBeenCalled();
  });
});
