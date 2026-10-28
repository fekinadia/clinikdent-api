import { EventEmitter2 } from '@nestjs/event-emitter';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationSettingsService } from './automation-settings.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

// Rappels WhatsApp (2026-10-23) : plus aucun rappel automatique n'est marqué
// « envoyé » alors que rien n'est parti.

function makeService(configured: boolean, sendResult = { success: false }) {
  const prisma = {
    appointmentReminder: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 50,
          appointmentId: 10,
          offsetHours: 24,
          statut: 'programme',
          appointment: {
            dateDebut: new Date('2026-10-24T09:00:00Z'),
            patient: { gsm: '20000000' },
          },
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
  const whatsappService = {
    isConfigured: jest.fn().mockReturnValue(configured),
    sendAppointmentReminder: jest.fn().mockResolvedValue(sendResult),
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

const NOW = new Date('2026-10-23T12:00:00Z'); // rappel 24h dû depuis le 23/10 09:00

describe('AutomationSchedulerService.processReminders — fin du faux « Envoyé »', () => {
  it("ne réclame ni ne marque aucun rappel tant que WhatsApp n'est pas configuré", async () => {
    const { service, prisma, whatsappService } = makeService(false);

    const sent = await (service as any).processReminders(NOW);

    expect(sent).toBe(0);
    expect(prisma.appointmentReminder.findMany).not.toHaveBeenCalled();
    expect(prisma.appointmentReminder.updateMany).not.toHaveBeenCalled();
    expect(whatsappService.sendAppointmentReminder).not.toHaveBeenCalled();
  });

  it("passe le rappel en « echec » si l'envoi échoue, et ne le compte pas", async () => {
    const { service, prisma } = makeService(true, { success: false });

    const sent = await (service as any).processReminders(NOW);

    expect(sent).toBe(0);
    expect(prisma.appointmentReminder.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { statut: 'echec', envoyeAt: null },
    });
  });

  it("garde « envoye » et compte le rappel quand l'envoi réussit", async () => {
    const { service, prisma } = makeService(true, { success: true });

    const sent = await (service as any).processReminders(NOW);

    expect(sent).toBe(1);
    expect(prisma.appointmentReminder.updateMany).toHaveBeenCalledWith({
      where: { id: 50, statut: 'programme' },
      data: { statut: 'envoye', envoyeAt: NOW },
    });
    expect(prisma.appointmentReminder.update).not.toHaveBeenCalled();
  });
});
