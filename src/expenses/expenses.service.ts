import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

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
  createdById: number | null;
  createdAt: Date;
}) {
  return {
    ...expense,
    montant: Number(expense.montant),
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

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
    await this.assertExpenseDuCabinet(cabinetId, id);
    await this.prisma.expense.delete({ where: { id } });

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
}
