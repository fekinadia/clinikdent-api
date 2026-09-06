import { ForbiddenException } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    patient: { findUnique: jest.fn() },
    appointment: { findUnique: jest.fn() },
    actCatalog: { findMany: jest.fn() },
    treatment: { create: jest.fn() },
  } as any;
  const service = new TreatmentsService(prisma);
  return { service, prisma };
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
