import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateDemoAccountDto } from './dto/admin.dto';
import { DEMO_DURATION_HOURS, TRIAL_DAYS } from '../billing/plan-limits';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

function generatePassword(): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async createDemoAccount(dto: CreateDemoAccountDto, actor?: ActorContext) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const estPermanent = dto.type === 'permanent';

    const demoExpiresAt = estPermanent
      ? null
      : new Date(Date.now() + DEMO_DURATION_HOURS * 60 * 60 * 1000);
    const trialEndsAt = estPermanent
      ? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const cabinet = await tx.cabinet.create({
        data: {
          nom: dto.nomCabinet,
          estDemo: !estPermanent,
          demoExpiresAt,
          trialEndsAt,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          nom: dto.nom,
          prenom: dto.prenom,
          cabinetId: cabinet.id,
          role: 'admin',
        },
      });

      return { cabinet, user };
    });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId: result.cabinet.id,
      action: 'user.create',
      entityType: 'User',
      entityId: result.user.id,
      details: {
        type: estPermanent ? 'permanent' : 'demo',
        nomCabinet: result.cabinet.nom,
        email: result.user.email,
      },
      ipAddress: actor?.ipAddress,
    });

    return {
      cabinetId: result.cabinet.id,
      nomCabinet: result.cabinet.nom,
      email: result.user.email,
      password,
      type: estPermanent ? 'permanent' : 'demo',
      demoExpiresAt: result.cabinet.demoExpiresAt,
      trialEndsAt: result.cabinet.trialEndsAt,
    };
  }

  async listDemoAccounts() {
    const cabinets = await this.prisma.cabinet.findMany({
      where: { estDemo: true },
      orderBy: { createdAt: 'desc' },
      include: { users: { take: 1, orderBy: { id: 'asc' } } },
    });

    return cabinets.map((c) => ({
      cabinetId: c.id,
      nomCabinet: c.nom,
      email: c.users[0]?.email ?? null,
      createdAt: c.createdAt,
      demoExpiresAt: c.demoExpiresAt,
      expired: !!(c.demoExpiresAt && c.demoExpiresAt < new Date()),
    }));
  }

  async listAllAccounts() {
    const cabinets = await this.prisma.cabinet.findMany({
      orderBy: { createdAt: 'desc' },
      include: { users: { take: 1, orderBy: { id: 'asc' } } },
    });

    const now = new Date();

    return cabinets.map((c) => {
      const type: 'demo' | 'permanent' = c.estDemo ? 'demo' : 'permanent';

      let statut: string;
      if (c.estDemo) {
        statut = c.demoExpiresAt && c.demoExpiresAt < now ? 'expire' : 'actif';
      } else if (c.subscriptionStatus === 'active') {
        statut = 'abonne';
      } else if (c.trialEndsAt && c.trialEndsAt < now) {
        statut = 'essai_termine';
      } else {
        statut = 'essai';
      }

      return {
        cabinetId: c.id,
        nomCabinet: c.nom,
        email: c.users[0]?.email ?? null,
        type,
        plan: c.plan,
        subscriptionStatus: c.subscriptionStatus,
        createdAt: c.createdAt,
        demoExpiresAt: c.demoExpiresAt,
        trialEndsAt: c.trialEndsAt,
        subscriptionEndsAt: c.subscriptionEndsAt,
        statut,
      };
    });
  }

  async deleteAccount(cabinetId: number, actor?: ActorContext) {
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
    });
    if (!cabinet) {
      throw new NotFoundException('Compte introuvable');
    }

    // La suppression du cabinet entraîne, via les relations Prisma
    // (onDelete: Cascade), la suppression de toutes ses données liées :
    // utilisateurs, patients, rendez-vous, soins, ordonnances, paiements, etc.
    await this.prisma.cabinet.delete({ where: { id: cabinetId } });

    // Écrit après la suppression : cabinetId n'a plus de contrainte de clé
    // étrangère vers `cabinets` sur AuditLog (colonne simple, non relation),
    // donc l'entrée reste consultable même une fois le cabinet supprimé —
    // c'est justement le but d'une trace d'audit pour une action destructive.
    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'cabinet.delete',
      entityType: 'Cabinet',
      entityId: cabinetId,
      details: { nomCabinet: cabinet.nom },
      ipAddress: actor?.ipAddress,
    });

    return { success: true, cabinetId, nomCabinet: cabinet.nom };
  }
}
