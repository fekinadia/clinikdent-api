import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: number;
  email: string;
  cabinetId: number;
}

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

  // Le retour de cette fonction sera disponible dans req.user
  async validate(payload: JwtPayload) {
    // Compte démo (24h) : on bloque l'accès dès que le délai est dépassé,
    // sur chaque requête authentifiée, sans toucher aux cabinets normaux
    // (estDemo vaut false par défaut pour tous les cabinets existants).
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: payload.cabinetId },
      select: { estDemo: true, demoExpiresAt: true },
    });

    if (
      cabinet?.estDemo &&
      cabinet.demoExpiresAt &&
      cabinet.demoExpiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        "Votre période d'essai de 24h est terminée. Contactez-nous pour continuer.",
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      cabinetId: payload.cabinetId,
    };
  }
}
