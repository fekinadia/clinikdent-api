import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY, Role } from './roles.decorator';

function makeContext(user: { role?: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredRoles: Role[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('laisse passer une route sans métadonnée @Roles (route "shared")', async () => {
    const guard = makeGuard(undefined);
    const context = makeContext({ role: 'medecin' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('autorise un admin sur une route @Roles("admin")', async () => {
    const guard = makeGuard(['admin']);
    const context = makeContext({ role: 'admin' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuse un medecin sur une route @Roles("admin") (403)', async () => {
    const guard = makeGuard(['admin']);
    const context = makeContext({ role: 'medecin' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  // Requête sans utilisateur : le garde authentifie lui-même le jeton
  // (correctif 2026-10-03) — testé de bout en bout, avec la vraie stratégie
  // JWT, dans roles.guard.integration.spec.ts (sans jeton / jeton invalide → 401).

  it('autorise medecin et admin sur une route partagée explicitement @Roles("admin","medecin")', async () => {
    const guard = makeGuard(['admin', 'medecin']);
    await expect(guard.canActivate(makeContext({ role: 'admin' }))).resolves.toBe(true);
    await expect(guard.canActivate(makeContext({ role: 'medecin' }))).resolves.toBe(true);
  });

  // Équipe & rôles (2026-09-29) : assistante/reception/comptable sont des
  // Role valides mais n'ont accès qu'aux routes qui les listent
  // explicitement — voir la matrice dans
  // claude/roadmap-parite-cabinet-care-2026-09-26.md.
  it('autorise un nouveau rôle (assistante) sur une route qui le liste', async () => {
    const guard = makeGuard(['admin', 'medecin', 'assistante']);
    await expect(guard.canActivate(makeContext({ role: 'assistante' }))).resolves.toBe(true);
  });

  it('refuse reception et comptable sur une route soins réservée à admin/medecin/assistante', async () => {
    const guard = makeGuard(['admin', 'medecin', 'assistante']);
    await expect(guard.canActivate(makeContext({ role: 'reception' }))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(makeContext({ role: 'comptable' }))).rejects.toThrow(ForbiddenException);
  });

  it('refuse assistante/reception sur une route Équipe réservée à admin', async () => {
    const guard = makeGuard(['admin']);
    await expect(guard.canActivate(makeContext({ role: 'assistante' }))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(makeContext({ role: 'reception' }))).rejects.toThrow(ForbiddenException);
  });
});
