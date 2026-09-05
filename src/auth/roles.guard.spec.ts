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
  it('laisse passer une route sans métadonnée @Roles (route "shared")', () => {
    const guard = makeGuard(undefined);
    const context = makeContext({ role: 'medecin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('autorise un admin sur une route @Roles("admin")', () => {
    const guard = makeGuard(['admin']);
    const context = makeContext({ role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuse un medecin sur une route @Roles("admin") (403)', () => {
    const guard = makeGuard(['admin']);
    const context = makeContext({ role: 'medecin' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('refuse une requête sans utilisateur (défense en profondeur)', () => {
    const guard = makeGuard(['admin']);
    const context = makeContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('autorise medecin et admin sur une route partagée explicitement @Roles("admin","medecin")', () => {
    const guard = makeGuard(['admin', 'medecin']);
    expect(guard.canActivate(makeContext({ role: 'admin' }))).toBe(true);
    expect(guard.canActivate(makeContext({ role: 'medecin' }))).toBe(true);
  });
});
