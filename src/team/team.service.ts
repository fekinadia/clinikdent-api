import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { PLAN_LIMITS, PlanKey, isValidPlan } from '../billing/plan-limits';
import { InviteMemberDto, UpdateMemberDto } from './dto/team.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

const MEMBER_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  role: true,
  actif: true,
  createdAt: true,
} as const;

/**
 * Génère un mot de passe à usage unique lisible, sur le même modèle que
 * les comptes démo (admin.service.ts) — la personne invitée doit le
 * changer à sa première connexion via "Changer mon mot de passe"
 * (chantier du 2026-09-21).
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Gestion de l'équipe d'un cabinet (Phase 2 "Équipe & rôles", 2026-09-29) :
 * inviter un membre (assistante/réception/comptable, ou un second
 * admin/médecin), changer son rôle, le désactiver/réactiver. Réservé au
 * rôle 'admin' du cabinet (voir @Roles sur le contrôleur) — orthogonal à
 * AdminModule qui gère la plateforme (multi-cabinets), pas l'équipe d'UN
 * cabinet.
 */
@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async listMembers(cabinetId: number) {
    return this.prisma.user.findMany({
      where: { cabinetId },
      select: MEMBER_SELECT,
      orderBy: [{ actif: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async inviteMember(cabinetId: number, dto: InviteMemberDto, actor: ActorContext) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    if (dto.role === 'medecin') {
      const cabinet = await this.prisma.cabinet.findUnique({ where: { id: cabinetId } });
      const planKey: PlanKey = cabinet && isValidPlan(cabinet.plan) ? cabinet.plan : 'starter';
      const maxPraticiens = PLAN_LIMITS[planKey].maxPraticiens;
      if (maxPraticiens !== null) {
        const nbPraticiens = await this.prisma.user.count({
          where: { cabinetId, role: 'medecin', actif: true },
        });
        if (nbPraticiens >= maxPraticiens) {
          throw new BadRequestException(
            `Limite de ${maxPraticiens} médecin(s) atteinte pour le plan ${PLAN_LIMITS[planKey].label}. Passez à un plan supérieur pour ajouter un médecin.`,
          );
        }
      }
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const member = await this.prisma.user.create({
      data: {
        cabinetId,
        email: dto.email,
        passwordHash,
        nom: dto.nom,
        prenom: dto.prenom,
        role: dto.role,
      },
      select: MEMBER_SELECT,
    });

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'team_member.invite',
      entityType: 'User',
      entityId: member.id,
      details: { role: dto.role, email: dto.email },
      ipAddress: actor.ipAddress,
    });

    // Le mot de passe temporaire n'est jamais stocké en clair ni rejoué —
    // renvoyé une seule fois ici pour que l'admin le transmette à la
    // personne invitée (pas d'envoi d'email automatique pour l'instant).
    return { ...member, tempPassword };
  }

  async updateMember(cabinetId: number, memberId: number, dto: UpdateMemberDto, actor: ActorContext) {
    const member = await this.prisma.user.findFirst({ where: { id: memberId, cabinetId } });
    if (!member) throw new NotFoundException('Membre introuvable');

    const willDemote = dto.role !== undefined && dto.role !== 'admin' && member.role === 'admin';
    const willDeactivate = dto.actif === false;

    if (member.id === actor.userId && (willDemote || willDeactivate)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas retirer vos propres droits admin ni vous désactiver vous-même',
      );
    }

    if (willDemote || (willDeactivate && member.role === 'admin')) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { cabinetId, role: 'admin', actif: true, id: { not: memberId } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException(
          "Impossible : ce serait le dernier compte admin actif du cabinet",
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
      },
      select: MEMBER_SELECT,
    });

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'team_member.update',
      entityType: 'User',
      entityId: memberId,
      details: { ancienRole: member.role, ...dto },
      ipAddress: actor.ipAddress,
    });

    return updated;
  }
}
