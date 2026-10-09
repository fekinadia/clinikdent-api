import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

// Pièce jointe (2026-10-09) : mêmes limites que les pièces jointes patient.
const TAILLE_MAX_OCTETS = 15 * 1024 * 1024; // 15 Mo
const DUREE_URL_SIGNEE = 300; // secondes

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Le montant est un Decimal Prisma côté base — on le convertit systématiquement
// en number avant de le renvoyer au frontend (même convention que FinanceService).
function serialize(expense: {
  id: number;
  cabinetId: number;
  categorie: string | null;
  libelle: string;
  montant: unknown;
  dateDepense: Date;
  fournisseur: string | null;
  justificatif: string | null;
  pieceJointeChemin?: string | null;
  pieceJointeNom?: string | null;
  pieceJointeMime?: string | null;
  createdById: number | null;
  createdAt: Date;
}) {
  // Le chemin interne dans le stockage n'est jamais renvoyé au navigateur :
  // le fichier s'ouvre uniquement via une URL signée temporaire.
  const { pieceJointeChemin, ...rest } = expense;
  return {
    ...rest,
    montant: Number(expense.montant),
    aPieceJointe: !!pieceJointeChemin,
  };
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private config: ConfigService,
  ) {}

  // Même configuration Supabase Storage que PatientImagesService (bucket
  // privé, clé service côté serveur uniquement).
  private storageConfig() {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'patient-files';
    if (!url || !serviceKey) {
      throw new BadRequestException(
        "Le stockage des fichiers n'est pas encore configuré (Supabase Storage)",
      );
    }
    return { url, serviceKey, bucket };
  }

  // Suppression « au mieux » d'un fichier du stockage : un échec ne doit
  // jamais bloquer la suppression/le remplacement côté base.
  private async supprimerDuStockage(chemin: string) {
    try {
      const { url, serviceKey, bucket } = this.storageConfig();
      await fetch(`${url}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [chemin] }),
      });
    } catch (err) {
      this.logger.warn(`Suppression du fichier ${chemin} impossible : ${String(err)}`);
    }
  }

  // Isolation cabinet strictement en 404, jamais 403 — même convention que
  // NoShowRecoveriesService / RemindersService : un ID inexistant et un ID
  // d'un autre cabinet doivent être indiscernables pour l'appelant.
  private async assertExpenseDuCabinet(cabinetId: number, id: number) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.cabinetId !== cabinetId) {
      throw new NotFoundException('Dépense introuvable');
    }
    return expense;
  }

  async findAll(cabinetId: number, from?: string, to?: string, categorie?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { cabinetId };
    if (from || to) {
      where.dateDepense = {};
      if (from) where.dateDepense.gte = new Date(from);
      if (to) where.dateDepense.lte = new Date(to);
    }
    if (categorie) where.categorie = categorie;

    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { dateDepense: 'desc' },
    });

    return expenses.map(serialize);
  }

  async getOverview(cabinetId: number, months: number) {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const where = { cabinetId, dateDepense: { gte: since } };

    const [totalAgg, parCategorieRaw] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { montant: true } }),
      this.prisma.expense.groupBy({
        by: ['categorie'],
        where,
        _sum: { montant: true },
      }),
    ]);

    const parCategorie = parCategorieRaw
      .map((g) => ({
        categorie: g.categorie || 'Autre',
        total: round(Number(g._sum.montant || 0)),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total: round(Number(totalAgg._sum.montant || 0)),
      parCategorie,
    };
  }

  async create(cabinetId: number, dto: CreateExpenseDto, actor: ActorContext) {
    const expense = await this.prisma.expense.create({
      data: {
        cabinetId,
        libelle: dto.libelle,
        montant: dto.montant,
        dateDepense: new Date(dto.dateDepense),
        categorie: dto.categorie,
        fournisseur: dto.fournisseur,
        justificatif: dto.justificatif,
        createdById: actor.userId,
      },
    });

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'expense.created',
      entityType: 'Expense',
      entityId: expense.id,
      details: { libelle: expense.libelle, montant: Number(expense.montant) },
      ipAddress: actor.ipAddress,
    });

    return serialize(expense);
  }

  async update(cabinetId: number, id: number, dto: UpdateExpenseDto, actor: ActorContext) {
    await this.assertExpenseDuCabinet(cabinetId, id);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.libelle !== undefined ? { libelle: dto.libelle } : {}),
        ...(dto.montant !== undefined ? { montant: dto.montant } : {}),
        ...(dto.dateDepense !== undefined ? { dateDepense: new Date(dto.dateDepense) } : {}),
        ...(dto.categorie !== undefined ? { categorie: dto.categorie } : {}),
        ...(dto.fournisseur !== undefined ? { fournisseur: dto.fournisseur } : {}),
        ...(dto.justificatif !== undefined ? { justificatif: dto.justificatif } : {}),
      },
    });

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'expense.updated',
      entityType: 'Expense',
      entityId: expense.id,
      ipAddress: actor.ipAddress,
    });

    return serialize(expense);
  }

  async delete(cabinetId: number, id: number, actor: ActorContext) {
    const existing = await this.assertExpenseDuCabinet(cabinetId, id);
    await this.prisma.expense.delete({ where: { id } });
    if (existing.pieceJointeChemin) {
      await this.supprimerDuStockage(existing.pieceJointeChemin);
    }

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'expense.deleted',
      entityType: 'Expense',
      entityId: id,
      ipAddress: actor.ipAddress,
    });

    return { success: true };
  }

  // ==== PIÈCE JOINTE (facture, reçu — 2026-10-09) ====

  async uploadPieceJointe(
    cabinetId: number,
    id: number,
    file: Express.Multer.File,
    actor: ActorContext,
  ) {
    const existing = await this.assertExpenseDuCabinet(cabinetId, id);
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > TAILLE_MAX_OCTETS) {
      throw new BadRequestException('Fichier trop volumineux (15 Mo maximum)');
    }

    const { url, serviceKey, bucket } = this.storageConfig();
    const extension = (file.originalname.split('.').pop() || 'bin').toLowerCase();
    const chemin = `cabinet-${cabinetId}/depenses/${id}/${randomUUID()}.${extension}`;

    const res = await fetch(`${url}/storage/v1/object/${bucket}/${chemin}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': file.mimetype || 'application/octet-stream',
      },
      body: file.buffer as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new BadRequestException("Erreur lors de l'envoi du fichier au stockage");
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        pieceJointeChemin: chemin,
        pieceJointeNom: file.originalname.slice(0, 255),
        pieceJointeMime: (file.mimetype || '').slice(0, 100) || null,
      },
    });

    // Remplacement : l'ancien fichier est retiré du stockage.
    if (existing.pieceJointeChemin) {
      await this.supprimerDuStockage(existing.pieceJointeChemin);
    }

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'expense.attachment_uploaded',
      entityType: 'Expense',
      entityId: id,
      details: { nom: file.originalname, taille: file.size },
      ipAddress: actor.ipAddress,
    });

    return serialize(expense);
  }

  async getPieceJointeUrl(cabinetId: number, id: number) {
    const expense = await this.assertExpenseDuCabinet(cabinetId, id);
    if (!expense.pieceJointeChemin) {
      throw new NotFoundException('Aucune pièce jointe pour cette dépense');
    }

    const { url, serviceKey, bucket } = this.storageConfig();
    const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${expense.pieceJointeChemin}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: DUREE_URL_SIGNEE }),
    });
    const data = res.ok ? ((await res.json()) as { signedURL?: string }) : null;
    if (!data?.signedURL) {
      throw new BadRequestException("Impossible d'ouvrir la pièce jointe pour le moment");
    }

    return {
      url: `${url}/storage/v1${data.signedURL}`,
      nom: expense.pieceJointeNom,
      mime: expense.pieceJointeMime,
    };
  }

  async deletePieceJointe(cabinetId: number, id: number, actor: ActorContext) {
    const existing = await this.assertExpenseDuCabinet(cabinetId, id);
    if (!existing.pieceJointeChemin) return serialize(existing);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: { pieceJointeChemin: null, pieceJointeNom: null, pieceJointeMime: null },
    });
    await this.supprimerDuStockage(existing.pieceJointeChemin);

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'expense.attachment_deleted',
      entityType: 'Expense',
      entityId: id,
      details: { nom: existing.pieceJointeNom },
      ipAddress: actor.ipAddress,
    });

    return serialize(expense);
  }
}
