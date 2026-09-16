import { EventEmitter2 } from '@nestjs/event-emitter';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationSettingsService } from './automation-settings.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const CABINET_A = 1;

function makeService() {
  const prisma = {
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    appointmentReminder: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    noShowRecovery: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    automationSettings: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    recall: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const whatsappService = {
    sendAppointmentReminder: jest.fn(),
    sendNoShowFollowUp: jest.fn(),
    sendRecall: jest.fn(),
  } as unknown as WhatsAppService;
  const automationSettingsService = { get: jest.fn() } as unknown as AutomationSettingsService;
  const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const service = new AutomationSchedulerService(
    prisma,
    whatsappService,
    automationSettingsService,
    eventEmitter,
    auditLog,
  );
  return { service, prisma, whatsappService, automationSettingsService, eventEmitter, auditLog };
}

const NOW = new Date('2026-09-06T12:00:00Z');
const DEFAULT_SETTINGS = { noShowActif: true, delaiNoShowHeures: 24 };

describe('AutomationSchedulerService — détection automatique des no-show (STEP 4)', () => {
  it('reclasse un RDV planifié dont le délai est écoulé, émet l\'événement et journalise (userId: null)', async () => {
    const { service, prisma, automationSettingsService, eventEmitter, auditLog } = makeService();
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 10,
        cabinetId: CABINET_A,
        patientId: 5,
        statut: 'planifie',
        dateFin: new Date('2026-09-05T10:00:00Z'), // 26h avant NOW > délai 24h
      },
    ]);
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ ...DEFAULT_SETTINGS });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    const detected = await (service as any).detectNoShows(NOW);

    expect(detected).toBe(1);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: 10, statut: 'planifie' },
      data: { statut: 'no_show' },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'appointment.no_show',
      expect.objectContaining({ appointmentId: 10, cabinetId: CABINET_A, patientId: 5 }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'appointment.no_show',
        details: expect.objectContaining({ source: 'automatic_detection' }),
      }),
    );
  });

  it("n'agit pas encore sur un RDV dont le délai n'est pas écoulé", async () => {
    const { service, prisma, automationSettingsService, eventEmitter } = makeService();
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 11,
        cabinetId: CABINET_A,
        patientId: 5,
        statut: 'confirme',
        dateFin: new Date('2026-09-06T10:00:00Z'), // 2h avant NOW, < 24h
      },
    ]);
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ ...DEFAULT_SETTINGS });

    const detected = await (service as any).detectNoShows(NOW);

    expect(detected).toBe(0);
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('ne détecte rien si noShowActif est désactivé pour le cabinet', async () => {
    const { service, prisma, automationSettingsService, eventEmitter } = makeService();
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 12,
        cabinetId: CABINET_A,
        patientId: 5,
        statut: 'planifie',
        dateFin: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    (automationSettingsService.get as jest.Mock).mockResolvedValue({
      noShowActif: false,
      delaiNoShowHeures: 24,
    });

    const detected = await (service as any).detectNoShows(NOW);

    expect(detected).toBe(0);
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it("respecte le délai personnalisé du cabinet (delaiNoShowHeures), pas de valeur codée en dur", async () => {
    const { service, prisma, automationSettingsService } = makeService();
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 13,
        cabinetId: CABINET_A,
        patientId: 5,
        statut: 'planifie',
        dateFin: new Date('2026-09-06T10:00:00Z'), // 2h avant NOW
      },
    ]);
    // Délai réglé à 1h : 2h écoulées > 1h => doit être détecté malgré le
    // défaut de 24h utilisé ailleurs dans les tests.
    (automationSettingsService.get as jest.Mock).mockResolvedValue({
      noShowActif: true,
      delaiNoShowHeures: 1,
    });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    const detected = await (service as any).detectNoShows(NOW);

    expect(detected).toBe(1);
  });

  it('sous exécution concurrente (claim perdu, count !== 1), ne réémet pas et ne recompte pas ce RDV', async () => {
    const { service, prisma, automationSettingsService, eventEmitter, auditLog } = makeService();
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 14,
        cabinetId: CABINET_A,
        patientId: 5,
        statut: 'planifie',
        dateFin: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ ...DEFAULT_SETTINGS });
    // Une autre exécution (cron concurrent) a déjà réclamé/modifié cette ligne.
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 });

    const detected = await (service as any).detectNoShows(NOW);

    expect(detected).toBe(0);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it("n'inclut jamais les statuts annule/termine/absent/no_show dans le pré-filtre de la requête", async () => {
    const { service, prisma, automationSettingsService } = makeService();
    prisma.appointment.findMany.mockResolvedValue([]);
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ ...DEFAULT_SETTINGS });

    await (service as any).detectNoShows(NOW);

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ statut: { in: ['planifie', 'confirme'] } }),
      }),
    );
  });

  it('résout les réglages via automationSettingsService.get() (getOrCreate) pour ne jamais ignorer un cabinet sans ligne AutomationSettings existante', async () => {
    const { service, prisma, automationSettingsService } = makeService();
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 15,
        cabinetId: CABINET_A,
        patientId: 5,
        statut: 'planifie',
        dateFin: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    (automationSettingsService.get as jest.Mock).mockResolvedValue({ ...DEFAULT_SETTINGS });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    await (service as any).detectNoShows(NOW);

    expect(automationSettingsService.get).toHaveBeenCalledWith(CABINET_A);
  });
});

describe('AutomationSchedulerService.processNoShowRecoveries — garde défensive (fix relance fantôme)', () => {
  it("n'envoie pas la relance si le RDV n'est plus no_show au moment de l'envoi (course détectée en mémoire)", async () => {
    const { service, prisma, whatsappService } = makeService();
    prisma.noShowRecovery.findMany.mockResolvedValue([
      {
        id: 200,
        appointmentId: 10,
        statut: 'en_attente',
        relanceEnvoyeeAt: null,
        appointment: {
          id: 10,
          cabinetId: CABINET_A,
          // Corrigé entre la lecture et l'envoi : ne doit plus être traité.
          statut: 'planifie',
          dateDebut: new Date('2026-09-01T00:00:00Z'),
          patient: { gsm: '20000000' },
        },
      },
    ]);

    const sent = await (service as any).processNoShowRecoveries(NOW);

    expect(sent).toBe(0);
    expect(whatsappService.sendNoShowFollowUp).not.toHaveBeenCalled();
    expect(prisma.noShowRecovery.updateMany).not.toHaveBeenCalled();
  });

  it('envoie normalement la relance quand le RDV est toujours no_show et le délai est écoulé', async () => {
    const { service, prisma, whatsappService } = makeService();
    prisma.noShowRecovery.findMany.mockResolvedValue([
      {
        id: 201,
        appointmentId: 11,
        statut: 'en_attente',
        relanceEnvoyeeAt: null,
        appointment: {
          id: 11,
          cabinetId: CABINET_A,
          statut: 'no_show',
          dateDebut: new Date('2026-09-01T00:00:00Z'),
          patient: { gsm: '20000000' },
        },
      },
    ]);
    prisma.automationSettings.findMany.mockResolvedValue([
      { cabinetId: CABINET_A, delaiNoShowHeures: 24 },
    ]);
    prisma.noShowRecovery.updateMany.mockResolvedValue({ count: 1 });

    const sent = await (service as any).processNoShowRecoveries(NOW);

    expect(sent).toBe(1);
    expect(whatsappService.sendNoShowFollowUp).toHaveBeenCalledWith('20000000', 11);
  });
});
