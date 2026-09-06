import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { AuditLogService } from '../audit/audit-log.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    patient: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const service = new PatientsService(prisma, auditLog);
  return { service, prisma, auditLog };
}

describe('PatientsService — isolation multi-cabinet', () => {
  it("refuse l'accès à un patient d'un autre cabinet (cabinet A ne peut pas lire un patient du cabinet B)", async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({
      id: 42,
      cabinetId: CABINET_B,
      numeroDossier: '00001',
    });

    await expect(service.findOne(CABINET_A, 42)).rejects.toThrow(ForbiddenException);
  });

  it('permet la lecture normale quand le patient appartient bien au cabinet demandeur', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({
      id: 42,
      cabinetId: CABINET_A,
      numeroDossier: '00001',
    });

    await expect(service.findOne(CABINET_A, 42)).resolves.toMatchObject({ id: 42 });
  });

  it('lève NotFoundException si le patient est introuvable', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue(null);

    await expect(service.findOne(CABINET_A, 999)).rejects.toThrow(NotFoundException);
  });
});

describe('PatientsService — suppression (destructive) et journal d\'audit', () => {
  it('supprime un patient du bon cabinet et écrit une entrée AuditLog', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.patient.findUnique.mockResolvedValue({
      id: 42,
      cabinetId: CABINET_A,
      numeroDossier: '00001',
    });
    prisma.patient.delete.mockResolvedValue({ id: 42 });

    const result = await service.delete(CABINET_A, 42, { userId: 7, ipAddress: '1.2.3.4' });

    expect(result).toEqual({ success: true });
    expect(prisma.patient.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        cabinetId: CABINET_A,
        action: 'patient.delete',
        entityType: 'Patient',
        entityId: 42,
        ipAddress: '1.2.3.4',
      }),
    );
  });

  it("refuse de supprimer un patient d'un autre cabinet, sans écrire d'entrée AuditLog", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.patient.findUnique.mockResolvedValue({
      id: 42,
      cabinetId: CABINET_B,
      numeroDossier: '00001',
    });

    await expect(service.delete(CABINET_A, 42, { userId: 7 })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.patient.delete).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });
});

describe('PatientsService — compteur et historique no-show (STEP 4)', () => {
  it('findOne calcule noShowCount à partir des RDV du patient au statut no_show', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({
      id: 42,
      cabinetId: CABINET_A,
      numeroDossier: '00001',
    });
    prisma.appointment.count.mockResolvedValue(3);

    const result = await service.findOne(CABINET_A, 42);

    expect(result.noShowCount).toBe(3);
    expect(prisma.appointment.count).toHaveBeenCalledWith({
      where: { patientId: 42, statut: 'no_show' },
    });
  });

  it("getNoShowHistory renvoie le total et la liste des RDV no_show, triés du plus récent au plus ancien", async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({ id: 42, cabinetId: CABINET_A });
    const rdv = [
      { id: 1, dateDebut: new Date('2026-08-01') },
      { id: 2, dateDebut: new Date('2026-07-01') },
    ];
    prisma.appointment.findMany.mockResolvedValue(rdv);

    const result = await service.getNoShowHistory(CABINET_A, 42);

    expect(result.total).toBe(2);
    expect(result.derniereDateAt).toEqual(new Date('2026-08-01'));
    expect(result.rendezVous).toEqual(rdv);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: 42, statut: 'no_show' },
        orderBy: { dateDebut: 'desc' },
      }),
    );
  });

  it('getNoShowHistory renvoie total: 0 et derniereDateAt: null si aucun no-show', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({ id: 42, cabinetId: CABINET_A });
    prisma.appointment.findMany.mockResolvedValue([]);

    const result = await service.getNoShowHistory(CABINET_A, 42);

    expect(result).toEqual({ total: 0, derniereDateAt: null, rendezVous: [] });
  });

  it("getNoShowHistory : 404 (jamais 403) si le patient n'existe pas", async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue(null);

    await expect(service.getNoShowHistory(CABINET_A, 999)).rejects.toThrow(NotFoundException);
  });

  it("getNoShowHistory : 404 (jamais 403) si le patient appartient à un autre cabinet — isolation stricte pour ce nouvel endpoint STEP 4", async () => {
    const { service, prisma } = makeService();
    prisma.patient.findUnique.mockResolvedValue({ id: 42, cabinetId: CABINET_B });

    await expect(service.getNoShowHistory(CABINET_A, 42)).rejects.toThrow(NotFoundException);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });
});
