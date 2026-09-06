import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentsService } from './appointments.service';
import { AuditLogService } from '../audit/audit-log.service';

const CABINET_A = 1;
const CABINET_B = 2;

function makeService() {
  const prisma = {
    appointment: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    patient: {
      update: jest.fn(),
    },
  } as any;
  const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const service = new AppointmentsService(prisma, eventEmitter, auditLog);
  return { service, prisma, eventEmitter, auditLog };
}

const APPT_PLANIFIE = {
  id: 100,
  cabinetId: CABINET_A,
  patientId: 7,
  statut: 'planifie',
};

describe('AppointmentsService.markNoShow — endpoint dédié STEP 4', () => {
  it('marque un RDV planifié comme no_show, émet l\'événement et journalise', async () => {
    const { service, prisma, eventEmitter, auditLog } = makeService();
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT_PLANIFIE });
    prisma.appointment.update.mockResolvedValue({
      ...APPT_PLANIFIE,
      statut: 'no_show',
      patient: {},
      type: null,
      medecin: null,
    });

    const result = await service.markNoShow(CABINET_A, 100, { userId: 3, ipAddress: '9.9.9.9' });

    expect(result.statut).toBe('no_show');
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 }, data: { statut: 'no_show' } }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'appointment.no_show',
      expect.objectContaining({ appointmentId: 100, cabinetId: CABINET_A, patientId: 7 }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        cabinetId: CABINET_A,
        action: 'appointment.no_show',
        entityType: 'Appointment',
        entityId: 100,
        ipAddress: '9.9.9.9',
      }),
    );
  });

  it("est idempotent : un second appel sur un RDV déjà no_show ne réémet pas l'événement ni ne réaudite", async () => {
    const { service, prisma, eventEmitter, auditLog } = makeService();
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT_PLANIFIE, statut: 'no_show' });

    const result = await service.markNoShow(CABINET_A, 100, { userId: 3 });

    expect(result).toBeDefined();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it.each(['annule', 'termine'])(
    'rejette le marquage no-show sur un RDV déjà résolu (%s)',
    async (statut) => {
      const { service, prisma } = makeService();
      prisma.appointment.findUnique.mockResolvedValue({ ...APPT_PLANIFIE, statut });

      await expect(service.markNoShow(CABINET_A, 100, { userId: 3 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    },
  );

  it("renvoie 404 (jamais 403) si le RDV n'existe pas", async () => {
    const { service, prisma } = makeService();
    prisma.appointment.findUnique.mockResolvedValue(null);

    await expect(service.markNoShow(CABINET_A, 999, { userId: 3 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("renvoie 404 (jamais 403) si le RDV appartient à un autre cabinet", async () => {
    const { service, prisma } = makeService();
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT_PLANIFIE, cabinetId: CABINET_B });

    await expect(service.markNoShow(CABINET_A, 100, { userId: 3 })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});

describe('AppointmentsService.update — correction du statut no_show (fix relance fantôme)', () => {
  function mockFindOneOnce(prisma: any, before: any) {
    prisma.appointment.findUnique.mockResolvedValueOnce({
      ...before,
      patient: {},
      type: null,
      medecin: null,
    });
  }

  it("émet appointment.no_show_corrected et journalise quand un RDV sort du statut no_show", async () => {
    const { service, prisma, eventEmitter, auditLog } = makeService();
    mockFindOneOnce(prisma, { ...APPT_PLANIFIE, statut: 'no_show' });
    prisma.appointment.update.mockResolvedValue({
      ...APPT_PLANIFIE,
      statut: 'planifie',
      patient: { estProspect: false },
      type: null,
    });

    await service.update(CABINET_A, 100, { statut: 'planifie' } as any, { userId: 5 });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'appointment.no_show_corrected',
      expect.objectContaining({ appointmentId: 100, cabinetId: CABINET_A }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.no_show_corrected',
        entityId: 100,
        details: expect.objectContaining({ ancienStatut: 'no_show', nouveauStatut: 'planifie' }),
      }),
    );
  });

  it("n'émet PAS appointment.no_show_corrected quand le RDV n'était pas no_show avant", async () => {
    const { service, prisma, eventEmitter } = makeService();
    mockFindOneOnce(prisma, { ...APPT_PLANIFIE, statut: 'planifie' });
    prisma.appointment.update.mockResolvedValue({
      ...APPT_PLANIFIE,
      statut: 'confirme',
      patient: { estProspect: false },
      type: null,
    });

    await service.update(CABINET_A, 100, { statut: 'confirme' } as any, { userId: 5 });

    const calls = (eventEmitter.emit as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('appointment.no_show_corrected');
  });

  it('un RDV qui reste no_show (aucun changement de statut) ne déclenche pas la correction', async () => {
    const { service, prisma, eventEmitter } = makeService();
    mockFindOneOnce(prisma, { ...APPT_PLANIFIE, statut: 'no_show' });
    prisma.appointment.update.mockResolvedValue({
      ...APPT_PLANIFIE,
      statut: 'no_show',
      patient: { estProspect: false },
      type: null,
    });

    // dto.statut === before.statut : aucune transition
    await service.update(CABINET_A, 100, { statut: 'no_show' } as any, { userId: 5 });

    const calls = (eventEmitter.emit as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('appointment.no_show_corrected');
  });
});
