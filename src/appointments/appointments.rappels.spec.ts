import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentsService } from './appointments.service';
import { AuditLogService } from '../audit/audit-log.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
  } as any;
  const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const service = new AppointmentsService(prisma, eventEmitter, auditLog);
  return { service, prisma, eventEmitter, auditLog };
}

// Journée du 24/10 à l'heure de Tunisie (UTC+1), telle que l'envoie le navigateur.
const JOURNEE = { debut: '2026-10-23T23:00:00.000Z', fin: '2026-10-24T23:00:00.000Z' };

describe('AppointmentsService.findRappels — rappels WhatsApp en un geste', () => {
  it('liste les RDV du cabinet sur la période, sans les annulés/terminés/absents/no-show', async () => {
    const { service, prisma } = makeService();
    await service.findRappels(CABINET_A, JOURNEE);

    const args = prisma.appointment.findMany.mock.calls[0][0];
    expect(args.where.cabinetId).toBe(CABINET_A);
    expect(args.where.dateDebut).toEqual({
      gte: new Date(JOURNEE.debut),
      lt: new Date(JOURNEE.fin),
    });
    expect(args.where.statut).toEqual({ notIn: ['annule', 'termine', 'absent', 'no_show'] });
    expect(args.orderBy).toEqual({ dateDebut: 'asc' });
    expect(args.include.patient.select).toEqual(
      expect.objectContaining({ gsm: true, langueMessages: true }),
    );
    expect(args.include.rappelEnvoyeParUser).toBeDefined();
  });

  it('refuse une fin avant le début', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.findRappels(CABINET_A, { debut: JOURNEE.fin, fin: JOURNEE.debut }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('refuse une période de plus de 7 jours', async () => {
    const { service } = makeService();
    await expect(
      service.findRappels(CABINET_A, {
        debut: '2026-10-01T00:00:00.000Z',
        fin: '2026-10-09T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AppointmentsService.marquerRappel / annulerRappel', () => {
  it("note le rappel (heure + auteur) et journalise l'action", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.appointment.findUnique.mockResolvedValue({ id: 100, cabinetId: CABINET_A });

    const result = await service.marquerRappel(CABINET_A, 100, { userId: 3, ipAddress: '9.9.9.9' });

    const { data } = prisma.appointment.update.mock.calls[0][0];
    expect(data.rappelEnvoye).toBe(true);
    expect(data.rappelEnvoyeAt).toBeInstanceOf(Date);
    expect(data.rappelEnvoyePar).toBe(3);
    expect(result.rappelEnvoye).toBe(true);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        cabinetId: CABINET_A,
        action: 'appointment.rappel_whatsapp',
        entityType: 'Appointment',
        entityId: 100,
      }),
    );
  });

  it("annule le rappel noté par erreur et journalise l'annulation", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.appointment.findUnique.mockResolvedValue({ id: 100, cabinetId: CABINET_A });

    await service.annulerRappel(CABINET_A, 100, { userId: 3 });

    expect(prisma.appointment.update.mock.calls[0][0].data).toEqual({
      rappelEnvoye: false,
      rappelEnvoyeAt: null,
      rappelEnvoyePar: null,
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.rappel_whatsapp_annule', entityId: 100 }),
    );
  });

  it("refuse un RDV d'un autre cabinet (rien n'est modifié)", async () => {
    const { service, prisma, auditLog } = makeService();
    prisma.appointment.findUnique.mockResolvedValue({ id: 100, cabinetId: CABINET_B });

    await expect(service.marquerRappel(CABINET_A, 100, { userId: 3 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.annulerRappel(CABINET_A, 100, { userId: 3 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('refuse un RDV introuvable', async () => {
    const { service, prisma } = makeService();
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(service.marquerRappel(CABINET_A, 999, { userId: 3 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
