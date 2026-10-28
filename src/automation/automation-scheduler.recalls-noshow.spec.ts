import { EventEmitter2 } from '@nestjs/event-emitter';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationSettingsService } from './automation-settings.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

// Fin du faux « Envoyé » (2026-10-24) : recalls et relances no-show ne sont
// plus marqués envoyés alors que rien n'est parti.

function makeService(configured: boolean, sendResult = { success: false }) {
  const prisma = {
    recall: {
      findMany: jest.fn().mockResolvedValue([
        { id: 70, statut: 'a_venir', patient: { gsm: '20000000' } },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    noShowRecovery: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 80,
          appointmentId: 12,
          statut: 'en_attente',
          relanceEnvoyeeAt: null,
          appointment: {
            cabinetId: 1,
            statut: 'no_show',
            dateDebut: new Date('2026-10-20T09:00:00Z'),
            patient: { gsm: '20000000' },
          },
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    automationSettings: {
      findMany: jest.fn().mockResolvedValue([{ cabinetId: 1, delaiNoShowHeures: 24 }]),
    },
  } as any;
  const whatsappService = {
    isConfigured: jest.fn().mockReturnValue(configured),
    sendRecall: jest.fn().mockResolvedValue(sendResult),
    sendNoShowFollowUp: jest.fn().mockResolvedValue(sendResult),
  } as unknown as WhatsAppService;
  const service = new AutomationSchedulerService(
    prisma,
    whatsappService,
    { get: jest.fn() } as unknown as AutomationSettingsService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    { log: jest.fn() } as unknown as AuditLogService,
  );
  return { service, prisma, whatsappService };
}

const NOW = new Date('2026-10-24T12:00:00Z'); // relance no-show due depuis le 21/10 09:00

describe('AutomationSchedulerService.processRecalls — fin du faux « Envoyé »', () => {
  it("passe le recall échu en « du » sans rien envoyer tant que WhatsApp n'est pas configuré", async () => {
    const { service, prisma, whatsappService } = makeService(false);

    const sent = await (service as any).processRecalls(NOW);

    expect(sent).toBe(0);
    expect(prisma.recall.updateMany).toHaveBeenCalledWith({
      where: { id: 70, statut: 'a_venir' },
      data: { statut: 'du' },
    });
    expect(whatsappService.sendRecall).not.toHaveBeenCalled();
    expect(prisma.recall.update).not.toHaveBeenCalled();
  });

  it("laisse le recall en « du » si l'envoi échoue, et ne le compte pas", async () => {
    const { service, prisma, whatsappService } = makeService(true, { success: false });

    const sent = await (service as any).processRecalls(NOW);

    expect(sent).toBe(0);
    expect(whatsappService.sendRecall).toHaveBeenCalledWith('20000000', 70);
    expect(prisma.recall.update).not.toHaveBeenCalled();
  });

  it("passe le recall en « envoye » et le compte quand l'envoi réussit", async () => {
    const { service, prisma } = makeService(true, { success: true });

    const sent = await (service as any).processRecalls(NOW);

    expect(sent).toBe(1);
    expect(prisma.recall.update).toHaveBeenCalledWith({
      where: { id: 70 },
      data: { statut: 'envoye' },
    });
  });

  it("n'envoie rien si un autre passage a déjà réclamé le recall", async () => {
    const { service, prisma, whatsappService } = makeService(true, { success: true });
    prisma.recall.updateMany.mockResolvedValue({ count: 0 });

    const sent = await (service as any).processRecalls(NOW);

    expect(sent).toBe(0);
    expect(whatsappService.sendRecall).not.toHaveBeenCalled();
  });
});

describe('AutomationSchedulerService.processNoShowRecoveries — fin du faux « envoyé »', () => {
  it("ne réclame ni ne date aucune relance tant que WhatsApp n'est pas configuré", async () => {
    const { service, prisma, whatsappService } = makeService(false);

    const sent = await (service as any).processNoShowRecoveries(NOW);

    expect(sent).toBe(0);
    expect(prisma.noShowRecovery.findMany).not.toHaveBeenCalled();
    expect(prisma.noShowRecovery.updateMany).not.toHaveBeenCalled();
    expect(whatsappService.sendNoShowFollowUp).not.toHaveBeenCalled();
  });

  it("efface la date de relance si l'envoi échoue, sans toucher au statut", async () => {
    const { service, prisma } = makeService(true, { success: false });

    const sent = await (service as any).processNoShowRecoveries(NOW);

    expect(sent).toBe(0);
    expect(prisma.noShowRecovery.update).toHaveBeenCalledWith({
      where: { id: 80 },
      data: { relanceEnvoyeeAt: null },
    });
  });

  it("garde la date de relance et la compte quand l'envoi réussit", async () => {
    const { service, prisma, whatsappService } = makeService(true, { success: true });

    const sent = await (service as any).processNoShowRecoveries(NOW);

    expect(sent).toBe(1);
    expect(prisma.noShowRecovery.updateMany).toHaveBeenCalledWith({
      where: { id: 80, statut: 'en_attente', relanceEnvoyeeAt: null },
      data: { relanceEnvoyeeAt: NOW },
    });
    expect(whatsappService.sendNoShowFollowUp).toHaveBeenCalledWith('20000000', 12);
    expect(prisma.noShowRecovery.update).not.toHaveBeenCalled();
  });
});
