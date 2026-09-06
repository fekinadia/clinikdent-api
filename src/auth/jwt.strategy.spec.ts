import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

function makeStrategy(userFindUniqueImpl: (...args: any[]) => any) {
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  const prisma = {
    user: { findUnique: jest.fn(userFindUniqueImpl) },
  } as any;
  return { strategy: new JwtStrategy(config, prisma), prisma };
}

const payload = { sub: 1, email: 'doc@example.com', cabinetId: 10 };

describe('JwtStrategy.validate', () => {
  it('autorise un utilisateur actif dont le cabinet est normal (non démo)', async () => {
    const { strategy } = makeStrategy(() => ({
      id: 1,
      email: 'doc@example.com',
      cabinetId: 10,
      role: 'medecin',
      actif: true,
      cabinet: { estDemo: false, demoExpiresAt: null },
    }));

    const result = await strategy.validate(payload);
    expect(result).toEqual({
      userId: 1,
      email: 'doc@example.com',
      cabinetId: 10,
      role: 'medecin',
    });
  });

  it('rejette un utilisateur désactivé (actif = false) même avec un JWT valide', async () => {
    const { strategy } = makeStrategy(() => ({
      id: 1,
      email: 'doc@example.com',
      cabinetId: 10,
      role: 'medecin',
      actif: false,
      cabinet: { estDemo: false, demoExpiresAt: null },
    }));

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it("rejette un utilisateur qui n'existe plus (supprimé après émission du JWT)", async () => {
    const { strategy } = makeStrategy(() => null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejette un cabinet démo dont le délai de 24h est dépassé', async () => {
    const { strategy } = makeStrategy(() => ({
      id: 1,
      email: 'doc@example.com',
      cabinetId: 10,
      role: 'admin',
      actif: true,
      cabinet: { estDemo: true, demoExpiresAt: new Date(Date.now() - 1000) },
    }));

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('autorise un cabinet démo encore dans son délai de 24h', async () => {
    const { strategy } = makeStrategy(() => ({
      id: 1,
      email: 'doc@example.com',
      cabinetId: 10,
      role: 'admin',
      actif: true,
      cabinet: { estDemo: true, demoExpiresAt: new Date(Date.now() + 1000 * 60) },
    }));

    await expect(strategy.validate(payload)).resolves.toMatchObject({ userId: 1 });
  });
});
