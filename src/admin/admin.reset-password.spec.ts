import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';

// Mot de passe oublié (2026-10-29) : réinitialisation par l'administratrice
// de la plateforme, avec un mot de passe temporaire.

function makeService(user: any) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new AdminService(prisma, auditLog), prisma, auditLog };
}

const DENTISTE = { id: 12, email: 'dentiste@example.test', cabinetId: 4 };

describe('AdminService.resetPassword', () => {
  it('remplace le mot de passe par un mot de passe temporaire (haché) et le renvoie une fois', async () => {
    const { service, prisma } = makeService(DENTISTE);

    const res = await service.resetPassword(12, { userId: 1, ipAddress: '9.9.9.9' });

    expect(res.userId).toBe(12);
    expect(res.email).toBe('dentiste@example.test');
    expect(res.tempPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    const { where, data } = prisma.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: 12 });
    expect(data.passwordHash).not.toBe(res.tempPassword);
    expect(await bcrypt.compare(res.tempPassword, data.passwordHash)).toBe(true);
  });

  it("journalise l'action sans jamais y mettre le mot de passe", async () => {
    const { service, auditLog } = makeService(DENTISTE);

    const res = await service.resetPassword(12, { userId: 1 });

    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        cabinetId: 4,
        action: 'user.password_reset_by_admin',
        entityType: 'User',
        entityId: 12,
      }),
    );
    expect(JSON.stringify(auditLog.log.mock.calls[0][0])).not.toContain(res.tempPassword);
  });

  it('refuse un utilisateur inconnu sans rien modifier', async () => {
    const { service, prisma, auditLog } = makeService(null);

    await expect(service.resetPassword(999, { userId: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('génère un mot de passe différent à chaque réinitialisation', async () => {
    const { service } = makeService(DENTISTE);
    const a = await service.resetPassword(12, { userId: 1 });
    const b = await service.resetPassword(12, { userId: 1 });
    expect(a.tempPassword).not.toBe(b.tempPassword);
  });
});
