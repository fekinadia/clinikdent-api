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
