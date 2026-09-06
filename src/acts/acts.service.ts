import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateActDto, UpdateActDto } from './dto/act.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

export interface ListActsQuery {
  search?: string;
  categorie?: string;
  actif?: boolean;
}

/**
 * Catalogue des actes du cabinet (STEP 3).
 *
 * Le modèle Prisma ActCatalog et son lien optionnel depuis TreatmentAct
 * (acteId) existaient déjà dans le schéma mais n'étaient jamais exposés
 * par une API — voir l'audit du 2026-09-05 et le plan validé pour STEP 3.
 *
 * Règle d'isolation tenant : contrairement à PatientsService (404 puis
 * 403), ici toute tentative d'accès à un acte d'un autre cabinet renvoie
 * un 404 générique, sur demande explicite (STEP 3, point 3) — on ne
 * distingue jamais "n'existe pas" de "appartient à un autre cabinet".
 */
@Injectable()
export class ActsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private notFound(): never {
    throw new NotFoundException('Acte introuvable');
  }

  async findAll(cabinetId: number, query: ListActsQuery) {
    return this.prisma.actCatalog.findMany({
      where: {
        cabinetId,
        ...(query.actif !== undefined ? { actif: query.actif } : {}),
        ...(query.categorie ? { categorie: query.categorie } : {}),
        ...(query.search
          ? { libelle: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { libelle: 'asc' },
    });
  }

  async findOne(cabinetId: number, id: number) {
    const act = await this.prisma.actCatalog.findUnique({ where: { id } });
    if (!act || act.cabinetId !== cabinetId) {
      // Ne jamais distinguer "inexistant" de "appartient à un autre
      // cabinet" — même réponse 404 dans les deux cas (décision STEP 3).
      this.notFound();
    }
    return act;
  }

  /**
   * Vérifie qu'aucun autre acte ACTIF du cabinet ne porte déjà ce libellé
   * (comparaison insensible à la casse). Un acte désactivé ne bloque pas
   * la réutilisation de son nom.
   */
  private async assertNoDuplicateActifLibelle(
    cabinetId: number,
    libelle: string,
    excludeId?: number,
  ) {
    const existing = await this.prisma.actCatalog.findFirst({
      where: {
        cabinetId,
        actif: true,
        libelle: { equals: libelle, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Un acte actif portant ce nom existe déjà dans ce cabinet',
      );
    }
  }

  async create(cabinetId: number, dto: CreateActDto, actor?: ActorContext) {
    const libelle = dto.libelle.trim();
    if (!libelle) {
      throw new BadRequestException("Le nom de l'acte est requis");
    }
    const categorie = dto.categorie?.trim() || undefined;
    const actif = dto.actif ?? true;

    if (actif) {
      await this.assertNoDuplicateActifLibelle(cabinetId, libelle);
    }

    const act = await this.prisma.actCatalog.create({
      data: {
        cabinetId,
        libelle,
        categorie,
        description: dto.description?.trim() || undefined,
        tarifBase: dto.tarifBase,
        dureeMinutes: dto.dureeMinutes,
        actif,
      },
    });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'act.create',
      entityType: 'ActCatalog',
      entityId: act.id,
      details: { libelle: act.libelle },
      ipAddress: actor?.ipAddress,
    });

    return act;
  }

  async update(
    cabinetId: number,
    id: number,
    dto: UpdateActDto,
    actor?: ActorContext,
  ) {
    const current = await this.findOne(cabinetId, id);

    let libelle = current.libelle;
    if (dto.libelle !== undefined) {
      libelle = dto.libelle.trim();
      if (!libelle) {
        throw new BadRequestException("Le nom de l'acte est requis");
      }
    }
    const finalActif = dto.actif !== undefined ? dto.actif : current.actif;

    if (finalActif && (dto.libelle !== undefined || dto.actif !== undefined)) {
      await this.assertNoDuplicateActifLibelle(cabinetId, libelle, id);
    }

    const act = await this.prisma.actCatalog.update({
      where: { id },
      data: {
        ...(dto.libelle !== undefined ? { libelle } : {}),
        ...(dto.categorie !== undefined ? { categorie: dto.categorie?.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.tarifBase !== undefined ? { tarifBase: dto.tarifBase } : {}),
        ...(dto.dureeMinutes !== undefined ? { dureeMinutes: dto.dureeMinutes } : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
      },
    });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'act.update',
      entityType: 'ActCatalog',
      entityId: act.id,
      details: { fieldsChanged: Object.keys(dto) },
      ipAddress: actor?.ipAddress,
    });

    return act;
  }

  async toggle(cabinetId: number, id: number, actor?: ActorContext) {
    const current = await this.findOne(cabinetId, id);
    const nextActif = !current.actif;

    if (nextActif) {
      await this.assertNoDuplicateActifLibelle(cabinetId, current.libelle, id);
    }

    const act = await this.prisma.actCatalog.update({
      where: { id },
      data: { actif: nextActif },
    });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: nextActif ? 'act.activate' : 'act.deactivate',
      entityType: 'ActCatalog',
      entityId: act.id,
      details: { libelle: act.libelle },
      ipAddress: actor?.ipAddress,
    });

    return act;
  }

  /**
   * Suppression prudente : un acte déjà référencé par des soins
   * historiques n'est jamais supprimé physiquement (STEP 3, point 4) —
   * il est simplement désactivé, pour ne plus apparaître comme option
   * lors de la création d'un nouveau soin tout en restant lisible sur
   * les dossiers existants.
   */
  async delete(cabinetId: number, id: number, actor?: ActorContext) {
    await this.findOne(cabinetId, id);

    const usageCount = await this.prisma.treatmentAct.count({
      where: { acteId: id },
    });

    if (usageCount > 0) {
      const act = await this.prisma.actCatalog.update({
        where: { id },
        data: { actif: false },
      });

      await this.auditLog.log({
        userId: actor?.userId,
        cabinetId,
        action: 'act.delete',
        entityType: 'ActCatalog',
        entityId: id,
        details: { hardDeleted: false, reason: 'used_in_treatments', usageCount },
        ipAddress: actor?.ipAddress,
      });

      return {
        deleted: false,
        deactivated: true,
        message:
          'Cet acte est utilisé dans des soins existants : il a été désactivé plutôt que supprimé.',
        act,
      };
    }

    await this.prisma.actCatalog.delete({ where: { id } });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'act.delete',
      entityType: 'ActCatalog',
      entityId: id,
      details: { hardDeleted: true },
      ipAddress: actor?.ipAddress,
    });

    return { deleted: true, deactivated: false, message: 'Acte supprimé.' };
  }
}
