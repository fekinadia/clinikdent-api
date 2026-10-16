import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';

// Médicaments : catalogue commun en lecture seule + médicaments propres à
// chaque cabinet (2026-10-16).

const CABINET_A = 1;
const CABINET_B = 2;

const COMMUN = { id: 10, cabinetId: null, nom: 'Doliprane 1G', actif: true };
const DE_A = { id: 20, cabinetId: CABINET_A, nom: 'Mon baume', actif: true };
const DE_B = { id: 30, cabinetId: CABINET_B, nom: 'Baume du cabinet B', actif: true };

function makeService(medications: any[] = [COMMUN, DE_A, DE_B]) {
  const prisma = {
    medication: {
      findUnique: jest.fn(async ({ where }: any) => medications.find((m) => m.id === where.id) ?? null),
      findMany: jest.fn(async () => medications),
      count: jest.fn(async () => medications.length),
      create: jest.fn(async ({ data }: any) => ({ id: 99, actif: true, ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ ...medications.find((m) => m.id === where.id), ...data })),
    },
    prescriptionItem: { groupBy: jest.fn(async () => []) },
  } as any;
  return { service: new PrescriptionsService(prisma), prisma };
}

describe('PrescriptionsService — médicaments par cabinet', () => {
  describe('visibilité', () => {
    it("l'autocomplétion montre le catalogue commun et les médicaments du cabinet, jamais ceux des autres", async () => {
      const { service, prisma } = makeService();
      await service.listMedications(CABINET_A, 'bau');
      const where = prisma.medication.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ cabinetId: null }, { cabinetId: CABINET_A }]);
      expect(where.actif).toBe(true);
      expect(where.nom).toEqual({ contains: 'bau', mode: 'insensitive' });
    });

    it('la page Médicaments applique le même filtre au tableau et au total', async () => {
      const { service, prisma } = makeService();
      await service.listMedicationsCatalog(CABINET_A, { search: 'dol' });
      const wFind = prisma.medication.findMany.mock.calls[0][0].where;
      const wCount = prisma.medication.count.mock.calls[0][0].where;
      expect(wFind.OR).toEqual([{ cabinetId: null }, { cabinetId: CABINET_A }]);
      expect(wCount).toEqual(wFind);
    });

    it('chaque ligne indique si elle est modifiable : seulement les médicaments du cabinet', async () => {
      const { service } = makeService([COMMUN, DE_A]);
      const res = await service.listMedicationsCatalog(CABINET_A, {});
      expect(res.items.map((m: any) => [m.id, m.modifiable])).toEqual([
        [10, false],
        [20, true],
      ]);
    });
  });

  describe('création', () => {
    it('rattache le médicament au cabinet du jeton', async () => {
      const { service, prisma } = makeService();
      await service.createMedication(CABINET_A, { nom: 'Nouveau', dosage: '500 mg' } as any);
      expect(prisma.medication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cabinetId: CABINET_A, nom: 'Nouveau', dosage: '500 mg' }),
      });
    });
  });

  describe('modification', () => {
    it('autorise la modification d\'un médicament du cabinet', async () => {
      const { service, prisma } = makeService();
      await service.updateMedication(CABINET_A, 20, { nom: 'Baume 2' } as any);
      expect(prisma.medication.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { nom: 'Baume 2' },
      });
    });

    it('refuse (403) de modifier le catalogue commun', async () => {
      const { service, prisma } = makeService();
      await expect(service.updateMedication(CABINET_A, 10, { nom: 'Piraté' } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.medication.update).not.toHaveBeenCalled();
    });

    it("refuse (404) de modifier le médicament d'un autre cabinet, sans révéler qu'il existe", async () => {
      const { service, prisma } = makeService();
      await expect(service.updateMedication(CABINET_A, 30, { nom: 'Piraté' } as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.medication.update).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour un médicament inexistant', async () => {
      const { service } = makeService();
      await expect(service.updateMedication(CABINET_A, 999, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('retrait', () => {
    it("désactive (sans supprimer) un médicament du cabinet", async () => {
      const { service, prisma } = makeService();
      await service.deactivateMedication(CABINET_A, 20);
      expect(prisma.medication.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { actif: false } });
    });

    it("ne peut retirer ni le catalogue commun (403) ni le médicament d'un autre cabinet (404)", async () => {
      const { service, prisma } = makeService();
      await expect(service.deactivateMedication(CABINET_A, 10)).rejects.toThrow(ForbiddenException);
      await expect(service.deactivateMedication(CABINET_A, 30)).rejects.toThrow(NotFoundException);
      expect(prisma.medication.update).not.toHaveBeenCalled();
    });
  });
});
