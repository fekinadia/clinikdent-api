import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from './roles.decorator';

/**
 * Garde d'autorisation par rôle, enregistrée globalement (voir
 * app.module.ts, APP_GUARD) plutôt que route par route, pour éviter de
 * dupliquer `@UseGuards(RolesGuard)` dans une quinzaine de contrôleurs.
 *
 * Comportement :
 * - Aucune métadonnée @Roles() sur la route → laisse passer (le contrôle
 *   d'authentification reste entièrement à la charge de JwtGuard, déjà
 *   appliqué sur chaque contrôleur protégé). C'est le cas de la grande
 *   majorité des routes ("shared" dans la matrice d'autorisation).
 * - Métadonnée @Roles(...) présente → le rôle de l'utilisateur courant
 *   (posé par JwtStrategy à partir d'une lecture fraîche en base, jamais
 *   du seul payload JWT) doit être dans la liste, sinon 403.
 *
 * Ne fait AUCUNE vérification d'isolation cabinet — ça reste la
 * responsabilité de chaque service (cabinetId), inchangée par ce garde.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role } | undefined;

    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour effectuer cette action",
      );
    }

    return true;
  }
}
