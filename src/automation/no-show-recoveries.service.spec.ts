import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NoShowRecoveriesService } from './no-show-recoveries.service';
import { AuditLogService } from '../audit/audit-log.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    noShowRecovery: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findUnique: jest.fn(),
    },
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const service = new NoShowRecoveriesService(prisma, auditLog);
  return { service, prisma, auditLog };
}

const RECOVERY_A = {
  id: 500,
  appointmentId: 10,
  nouveauAppointmentId: null,
  statut: 'en_attente',
  appointment: { id: 10, cabinetId: CABINET_A },
};

describe('NoShowRecoveriesService — isolation multi-cabinet (404 uniquement)', () => {
  it("update (perdu) : 404 si la relance n'existe pas", async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue(null);

    await expect(
      service.update(CABINET_A, 999, { statut: 'perdu' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("update (perdu) : 404 (jamais 403) si la relance appartient à un RDV d'un autre cabinet", async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({
      ...RECOVERY_A,
      appointment: { id: 10, cabinetId: CABINET_B },
    });

    await expect(
      service.update(CABINET_A, 500, { statut: 'perdu' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.noShowRecovery.update).not.toHaveBeenCalled();
  });

  it('markRecovered : 404 sur une relance d\'un autre cabinet', async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({
      ...RECOVERY_A,
      appointment: { id: 10, cabinetId: CABINET_B },
    });

    await expect(service.markRecovered(CABINET_A, 500, {})).rejects.toThrow(NotFoundException);
  });
});

describe('NoShowRecoveriesService.update — workflow "perdu"', () => {
  it('marque la relance perdue et journalise', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({ ...RECOVERY_A });
    prisma.noShowRecovery.update.mockResolvedValue({ ...RECOVERY_A, statut: 'perdu' });

    const result = await service.update(CABINET_A, 500, { statut: 'perdu' } as any, {
      userId: 3,
    });

    expect(result.statut).toBe('perdu');
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'no_show_recovery.lost', entityId: 500 }),
    );
  });
});

describe('NoShowRecoveriesService.markRecovered — workflow "récupéré" (STEP 4)', () => {
  it('marque la relance récupérée sans lien de nouveau RDV', async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({ ...RECOVERY_A });
    prisma.noShowRecovery.update.mockResolvedValue({ ...RECOVERY_A, statut: 'recupere' });

    const result = await service.markRecovered(CABINET_A, 500, {}, { userId: 3 });

    expect(result.statut).toBe('recupere');
    expect(prisma.noShowRecovery.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { statut: 'recupere', nouveauAppointmentId: undefined },
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'no_show_recovery.recovered' }),
    );
  });

  it('marque la relance récupérée avec un lien valide vers un nouveau RDV du même cabinet', async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({ ...RECOVERY_A });
    prisma.appointment.findUnique.mockResolvedValue({ id: 20, cabinetId: CABINET_A });
    prisma.noShowRecovery.update.mockResolvedValue({
      ...RECOVERY_A,
      statut: 'recupere',
      nouveauAppointmentId: 20,
    });

    const result = await service.markRecovered(
      CABINET_A,
      500,
      { nouveauAppointmentId: 20 },
      { userId: 3 },
    );

    expect(result.nouveauAppointmentId).toBe(20);
  });

  it('rejette (400) si le nouveau RDV indiqué est le RDV manqué lui-même', async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({ ...RECOVERY_A });

    await expect(
      service.markRecovered(CABINET_A, 500, { nouveauAppointmentId: 10 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.noShowRecovery.update).not.toHaveBeenCalled();
  });

  it("rejette (400, pas 404) si le nouveau RDV indiqué appartient à un autre cabinet", async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({ ...RECOVERY_A });
    prisma.appointment.findUnique.mockResolvedValue({ id: 20, cabinetId: CABINET_B });

    await expect(
      service.markRecovered(CABINET_A, 500, { nouveauAppointmentId: 20 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.noShowRecovery.update).not.toHaveBeenCalled();
  });

  it("rejette (400) si le nouveau RDV indiqué n'existe pas du tout", async () => {
    const { service, prisma } = makeService();
    prisma.noShowRecovery.findUnique.mockResolvedValue({ ...RECOVERY_A });
    prisma.appointment.findUnique.mockResolvedValue(null);

    await expect(
      service.markRecovered(CABINET_A, 500, { nouveauAppointmentId: 999 }),
    ).rejects.toThrow(BadRequestException);
  });
});
