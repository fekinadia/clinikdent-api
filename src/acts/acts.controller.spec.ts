import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { ActsController } from './acts.controller';

/**
 * Vérifie le câblage RBAC réel des routes du catalogue (pas seulement la
 * logique générique de RolesGuard, déjà testée dans roles.guard.spec.ts) :
 * on utilise un vrai Reflector pour lire les métadonnées @Roles posées
 * sur ActsController — voir plan STEP 3, point 7.
 */
function makeContext(handler: Function, user: { role?: string } | undefined): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ActsController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new RolesGuard(new Reflector());
const admin = { role: 'admin' as const };
const medecin = { role: 'medecin' as const };

const MUTATION_HANDLERS = [
  ['create', ActsController.prototype.create],
  ['update', ActsController.prototype.update],
  ['toggle', ActsController.prototype.toggle],
  ['delete', ActsController.prototype.delete],
] as const;

const READ_HANDLERS = [
  ['findAll', ActsController.prototype.findAll],
  ['findOne', ActsController.prototype.findOne],
] as const;

describe('ActsController — matrice RBAC', () => {
  it.each(MUTATION_HANDLERS)('admin peut appeler %s', async (_name, handler) => {
    await expect(guard.canActivate(makeContext(handler, admin))).resolves.toBe(true);
  });

  it.each(MUTATION_HANDLERS)('medecin reçoit 403 sur %s', async (_name, handler) => {
    await expect(guard.canActivate(makeContext(handler, medecin))).rejects.toThrow(ForbiddenException);
  });

  it.each(READ_HANDLERS)('admin et medecin peuvent tous les deux appeler %s', async (_name, handler) => {
    await expect(guard.canActivate(makeContext(handler, admin))).resolves.toBe(true);
    await expect(guard.canActivate(makeContext(handler, medecin))).resolves.toBe(true);
  });
});
