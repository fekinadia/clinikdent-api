import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { TRIAL_DAYS } from '../billing/plan-limits';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Vérifier que l'email n'existe pas déjà
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    // Créer le cabinet ET l'utilisateur en une transaction
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    const result = await this.prisma.$transaction(async (tx) => {
      const cabinet = await tx.cabinet.create({
        data: { nom: dto.nomCabinet, trialEndsAt },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          nom: dto.nom,
          prenom: dto.prenom,
          cabinetId: cabinet.id,
          role: 'admin', // Premier utilisateur = admin
        },
      });

      return { cabinet, user };
    });

    return this.signToken(
      result.user.id,
      result.user.email,
      result.user.cabinetId,
      result.user.role,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.actif) {
      throw new UnauthorizedException('Identifiants incorrects');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants incorrects');
    }

    return this.signToken(user.id, user.email, user.cabinetId, user.role);
  }

  // Le payload JWT reste volontairement minimal (sub/email/cabinetId) : le
  // rôle et le statut du compte ne sont jamais lus depuis le jeton pour une
  // décision d'autorisation, seulement depuis une lecture fraîche en base à
  // chaque requête (voir JwtStrategy.validate). `role` n'est renvoyé ici
  // que pour permettre au frontend d'adapter son affichage (UX uniquement,
  // pas une frontière de sécurité — voir audit du 2026-09-05, section 10).
  private async signToken(
    userId: number,
    email: string,
    cabinetId: number,
    role: string,
  ) {
    const payload = { sub: userId, email, cabinetId };
    const token = await this.jwtService.signAsync(payload);

    const adminEmails = (this.config.get<string>('PLATFORM_ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isPlatformAdmin = adminEmails.includes(email.toLowerCase());

    return {
      accessToken: token,
      user: { id: userId, email, cabinetId, role, isPlatformAdmin },
    };
  }
}
