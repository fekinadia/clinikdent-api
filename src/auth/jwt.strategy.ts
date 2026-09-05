import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Role } from './roles.decorator';

export interface JwtPayload {
  sub: number;
  email: string;
  cabinetId: number;
}

/**
 * Message générique utilisé pour tout rejet d'authentification lié au
 * statut du compte (compte désactivé, introuvable, cabinet expiré) — on
 * évite volontairement de préciser lequel de ces cas s'est produit pour ne
 * pas donner d'indice exploitable (audit du 2026-09-05, section 9).
 */
const SESSION_INVALIDE = 'Session invalide, veuillez vous reconnecter';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  // Le retour de cette fonction sera disponible dans req.user, sur CHAQUE
  // requête authentifiée (Passport appelle validate() à chaque appel, pas
  // seulement à la connexion). On ne fait donc jamais confiance au seul
  // contenu du JWT pour le statut du compte : on relit l'utilisateur et son
  // cabinet en base à chaque fois (audit du 2026-09-05, point critique #4 —
  // un compte désactivé ne doit pas pouvoir continuer à utiliser un jeton
  // déjà émis jusqu'à son expiration naturelle, actuellement 7 jours).
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        cabinetId: true,
        role: true,
        actif: true,
        cabinet: { select: { estDemo: true, demoExpiresAt: true } },
      },
    });

    if (!user || !user.actif) {
      throw new UnauthorizedException(SESSION_INVALIDE);
    }

    // Compte démo (24h) : on bloque l'accès dès que le délai est dépassé,
    // sur chaque requête authentifiée, sans toucher aux cabinets normaux
    // (estDemo vaut false par défaut pour tous les cabinets existants).
    if (
      user.cabinet?.estDemo &&
      user.cabinet.demoExpiresAt &&
      user.cabinet.demoExpiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        "Votre période d'essai de 24h est terminée. Contactez-nous pour continuer.",
      );
    }

    return {
      userId: user.id,
      email: user.email,
      cabinetId: user.cabinetId,
      role: user.role as Role,
    };
  }
}
