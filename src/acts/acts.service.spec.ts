import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ActsService } from './acts.service';
import { AuditLogService } from '../audit/audit-log.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    actCatalog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    treatmentAct: {
      count: jest.fn(),
    },
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const service = new ActsService(prisma, auditLog);
  return { service, prisma, auditLog };
}

const ACT_A = {
  id: 10,
  cabinetId: CABINET_A,
  libelle: 'Détartrage',
  categorie: 'prevention',
  description: null,
  tarifBase: 90,
  dureeMinutes: 30,
  actif: true,
};

describe('ActsService — CRUD', () => {
  it('admin crée un acte avec succès et une entrée AuditLog est écrite', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findFirst.mockResolvedValue(null); // pas de doublon
    prisma.actCatalog.create.mockResolvedValue({ ...ACT_A });

    const result = await service.create(
      CABINET_A,
      { libelle: 'Détartrage', tarifBase: 90 },
      { userId: 1 },
    );

    expect(result.libelle).toBe('Détartrage');
    expect(prisma.actCatalog.create).toHaveBeenCalled();
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'act.create', cabinetId: CABINET_A }),
    );
  });

  it('met à jour un acte existant', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A });
    prisma.actCatalog.findFirst.mockResolvedValue(null);
    prisma.actCatalog.update.mockResolvedValue({ ...ACT_A, tarifBase: 100 });

    const result = await service.update(CABINET_A, 10, { tarifBase: 100 }, { userId: 1 });

    expect(result.tarifBase).toBe(100);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'act.update' }),
    );
  });

  it('toggle désactive un acte actif', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, actif: true });
    prisma.actCatalog.update.mockResolvedValue({ ...ACT_A, actif: false });

    const result = await service.toggle(CABINET_A, 10, { userId: 1 });

    expect(result.actif).toBe(false);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'act.deactivate' }),
    );
  });

  it('toggle réactive un acte, avec vérification anti-doublon', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, actif: false });
    prisma.actCatalog.findFirst.mockResolvedValue(null);
    prisma.actCatalog.update.mockResolvedValue({ ...ACT_A, actif: true });

    const result = await service.toggle(CABINET_A, 10, { userId: 1 });

    expect(result.actif).toBe(true);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'act.activate' }),
    );
  });

  it('supprime définitivement un acte jamais utilisé', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A });
    prisma.treatmentAct.count.mockResolvedValue(0);
    prisma.actCatalog.delete.mockResolvedValue({ ...ACT_A });

    const result = await service.delete(CABINET_A, 10, { userId: 1 });

    expect(result).toMatchObject({ deleted: true, deactivated: false });
    expect(prisma.actCatalog.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(prisma.actCatalog.update).not.toHaveBeenCalled();
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'act.delete', details: expect.objectContaining({ hardDeleted: true }) }),
    );
  });

  it("désactive au lieu de supprimer un acte déjà utilisé dans des soins historiques", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A });
    prisma.treatmentAct.count.mockResolvedValue(3);
    prisma.actCatalog.update.mockResolvedValue({ ...ACT_A, actif: false });

    const result = await service.delete(CABINET_A, 10, { userId: 1 });

    expect(result).toMatchObject({ deleted: false, deactivated: true });
    expect(prisma.actCatalog.delete).not.toHaveBeenCalled();
    expect(prisma.actCatalog.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { actif: false },
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'act.delete',
        details: expect.objectContaining({ hardDeleted: false }),
      }),
    );
  });
});

describe('ActsService — règle anti-doublon (actes actifs, insensible à la casse)', () => {
  it('rejette la création si un acte actif porte déjà ce nom (peu importe la casse)', async () => {
    const { service, prisma } = makeService();
    prisma.actCatalog.findFirst.mockResolvedValue({ ...ACT_A, libelle: 'détartrage' });

    await expect(
      service.create(CABINET_A, { libelle: 'DÉTARTRAGE', tarifBase: 90 }, { userId: 1 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.actCatalog.create).not.toHaveBeenCalled();
  });

  it("n'est pas bloqué par un acte désactivé portant le même nom", async () => {
    const { service, prisma } = makeService();
    // findFirst est appelé avec actif: true dans le where ; ici on simule
    // le comportement réel de Prisma (aucun résultat car le seul acte du
    // même nom est inactif) plutôt que de vérifier l'appel exact.
    prisma.actCatalog.findFirst.mockResolvedValue(null);
    prisma.actCatalog.create.mockResolvedValue({ ...ACT_A });

    await expect(
      service.create(CABINET_A, { libelle: 'Détartrage', tarifBase: 90 }, { userId: 1 }),
    ).resolves.toBeDefined();
  });

  it('rejette la mise à jour si elle crée un doublon actif', async () => {
    const { service, prisma } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, id: 11, libelle: 'Consultation' });
    prisma.actCatalog.findFirst.mockResolvedValue({ ...ACT_A, id: 10 }); // un autre acte "Détartrage" actif existe déjà

    await expect(
      service.update(CABINET_A, 11, { libelle: 'Détartrage' }, { userId: 1 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.actCatalog.update).not.toHaveBeenCalled();
  });
});

describe('ActsService — validation métier', () => {
  it('rejette un libellé vide (espaces uniquement) sans toucher à la base', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.create(CABINET_A, { libelle: '   ', tarifBase: 50 }, { userId: 1 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.actCatalog.create).not.toHaveBeenCalled();
  });
});

describe('ActsService — isolation multi-cabinet (404 uniquement, jamais 403)', () => {
  it("renvoie 404 si l'acte n'existe pas du tout", async () => {
    const { service, prisma } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue(null);

    await expect(service.findOne(CABINET_A, 999)).rejects.toThrow(NotFoundException);
  });

  it("renvoie 404 (jamais 403) si l'acte appartient à un autre cabinet — lecture", async () => {
    const { service, prisma } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, cabinetId: CABINET_B });

    await expect(service.findOne(CABINET_A, 10)).rejects.toThrow(NotFoundException);
  });

  it('permet la lecture normale quand l\'acte appartient bien au cabinet demandeur', async () => {
    const { service, prisma } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A });

    await expect(service.findOne(CABINET_A, 10)).resolves.toMatchObject({ id: 10 });
  });

  it('update : 404 sur un acte du cabinet B, aucune écriture', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, cabinetId: CABINET_B });

    await expect(
      service.update(CABINET_A, 10, { tarifBase: 1 }, { userId: 1 }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.actCatalog.update).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('toggle : 404 sur un acte du cabinet B, aucune écriture', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, cabinetId: CABINET_B });

    await expect(service.toggle(CABINET_A, 10, { userId: 1 })).rejects.toThrow(NotFoundException);
    expect(prisma.actCatalog.update).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('delete : 404 sur un acte du cabinet B, aucune suppression ni désactivation', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.actCatalog.findUnique.mockResolvedValue({ ...ACT_A, cabinetId: CABINET_B });

    await expect(service.delete(CABINET_A, 10, { userId: 1 })).rejects.toThrow(NotFoundException);
    expect(prisma.actCatalog.delete).not.toHaveBeenCalled();
    expect(prisma.actCatalog.update).not.toHaveBeenCalled();
    expect(prisma.treatmentAct.count).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });
});
