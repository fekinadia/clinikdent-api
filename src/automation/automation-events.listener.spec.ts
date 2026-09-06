import { Prisma } from '@prisma/client';
import { AutomationEventsListener } from './automation-events.listener';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationSettingsService } from './automation-settings.service';

const CABINET_A = 1;

function makeListener() {
  const prisma = {
    appointment: { findUnique: jest.fn() },
    appointmentReminder: { create: jest.fn(), updateMany: jest.fn() },
    recall: { findFirst: jest.fn(), create: jest.fn() },
    noShowRecovery: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  } as any;
  const automationSettingsService = { get: jest.fn() } as unknown as AutomationSettingsService;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const listener = new AutomationEventsListener(prisma, automationSettingsService, auditLog);
  return { listener, prisma, automationSettingsService, auditLog };
}

function prismaKnownError(code: string) {
  return Object.assign(Object.create(Prisma.PrismaClientKnownRequestError.prototype), {
    code,
    message: 'Unique constraint failed',
  });
}

describe('AutomationEventsListener.handleAppointmentNoShow — création de la relance', () => {
  it('crée une NoShowRecovery et journalise (userId: null, événement système)', async () => {
    const { listener, prisma, automationSettingsService, auditLog } = makeListener();
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ noShowActif: true });
    prisma.noShowRecovery.findFirst.mockResolvedValue(null);
    prisma.noShowRecovery.create.mockResolvedValue({ id: 500 });

    await listener.handleAppointmentNoShow({
      appointmentId: 10,
      cabinetId: CABINET_A,
      patientId: 5,
    });

    expect(prisma.noShowRecovery.create).toHaveBeenCalledWith({
      data: { appointmentId: 10, statut: 'en_attente' },
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'no_show_recovery.created',
        entityId: 500,
      }),
    );
  });

  it('ne crée rien si noShowActif est désactivé pour le cabinet', async () => {
    const { listener, prisma, automationSettingsService } = makeListener();
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ noShowActif: false });

    await listener.handleAppointmentNoShow({ appointmentId: 10, cabinetId: CABINET_A, patientId: 5 });

    expect(prisma.noShowRecovery.create).not.toHaveBeenCalled();
  });

  it('ne crée pas de doublon si une relance existe déjà (check-then-act)', async () => {
    const { listener, prisma, automationSettingsService } = makeListener();
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ noShowActif: true });
    prisma.noShowRecovery.findFirst.mockResolvedValue({ id: 42 });

    await listener.handleAppointmentNoShow({ appointmentId: 10, cabinetId: CABINET_A, patientId: 5 });

    expect(prisma.noShowRecovery.create).not.toHaveBeenCalled();
  });

  it("absorbe silencieusement une violation de contrainte unique (P2002) en cas de course concurrente", async () => {
    const { listener, prisma, automationSettingsService, auditLog } = makeListener();
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ noShowActif: true });
    prisma.noShowRecovery.findFirst.mockResolvedValue(null);
    prisma.noShowRecovery.create.mockRejectedValue(prismaKnownError('P2002'));

    await expect(
      listener.handleAppointmentNoShow({ appointmentId: 10, cabinetId: CABINET_A, patientId: 5 }),
    ).resolves.toBeUndefined();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('relance une erreur Prisma qui n\'est pas une violation de contrainte unique', async () => {
    const { listener, prisma, automationSettingsService } = makeListener();
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ noShowActif: true });
    prisma.noShowRecovery.findFirst.mockResolvedValue(null);
    prisma.noShowRecovery.create.mockRejectedValue(prismaKnownError('P2003'));

    await expect(
      listener.handleAppointmentNoShow({ appointmentId: 10, cabinetId: CABINET_A, patientId: 5 }),
    ).rejects.toBeDefined();
  });
});

describe('AutomationEventsListener.handleAppointmentNoShowCorrected — fix relance fantôme', () => {
  it('bascule une relance en_attente vers annule quand le RDV source est corrigé', async () => {
    const { listener, prisma } = makeListener();
    prisma.noShowRecovery.updateMany.mockResolvedValue({ count: 1 });

    await listener.handleAppointmentNoShowCorrected({ appointmentId: 10, cabinetId: CABINET_A });

    expect(prisma.noShowRecovery.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: 10, statut: 'en_attente' },
      data: { statut: 'annule' },
    });
  });

  it('est un no-op silencieux si aucune relance en_attente ne correspond (déjà recupere/perdu/annule, ou aucune relance)', async () => {
    const { listener, prisma } = makeListener();
    prisma.noShowRecovery.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      listener.handleAppointmentNoShowCorrected({ appointmentId: 10, cabinetId: CABINET_A }),
    ).resolves.toBeUndefined();
  });

  it("n'affecte que la relance en_attente ciblée, jamais celles déjà recupere/perdu (garanti par le where de l'updateMany)", async () => {
    const { listener, prisma } = makeListener();
    prisma.noShowRecovery.updateMany.mockResolvedValue({ count: 1 });

    await listener.handleAppointmentNoShowCorrected({ appointmentId: 77, cabinetId: CABINET_A });

    const call = prisma.noShowRecovery.updateMany.mock.calls[0][0];
    expect(call.where.statut).toBe('en_attente');
  });
});
