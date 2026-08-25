import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto, ListPatientsQueryDto } from './dto/patient.dto';
import { PLAN_LIMITS, isValidPlan } from '../billing/plan-limits';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(cabinetId: number, userId: number, dto: CreatePatientDto) {
    await this.assertSousLaLimite(cabinetId);
    // Générer le numéro de dossier (incrémental par cabinet)
    const last = await this.prisma.patient.findFirst({
      where: { cabinetId },
      orderBy: { id: 'desc' },
    });
    const lastNum = last ? parseInt(last.numeroDossier) : 0;
    const numeroDossier = String(lastNum + 1).padStart(5, '0');

    return this.prisma.patient.create({
      data: {
        ...dto,
        dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
        numeroDossier,
        cabinetId,
        createdById: userId,
      },
    });
  }

  async findAll(cabinetId: number, query: ListPatientsQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { cabinetId };

    if (query.search) {
      where.OR = [
        { nom: { contains: query.search, mode: 'insensitive' } },
        { prenom: { contains: query.search, mode: 'insensitive' } },
        { gsm: { contains: query.search } },
        { numeroDossier: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async findOne(cabinetId: number, id: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        toothStates: true,
        appointments: {
          orderBy: { dateDebut: 'desc' },
          take: 10,
        },
        treatments: {
          orderBy: { dateSoin: 'desc' },
          include: { acts: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable');
    }
    if (patient.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce patient n'appartient pas à votre cabinet");
    }

    return patient;
  }

  async update(cabinetId: number, id: number, dto: UpdatePatientDto) {
    await this.findOne(cabinetId, id); // vérifier l'accès

    return this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
      },
    });
  }

  async delete(cabinetId: number, id: number) {
    await this.findOne(cabinetId, id);
    await this.prisma.patient.delete({ where: { id } });
    return { success: true };
  }

  async getStats(cabinetId: number) {
    const [total, ceMois] = await Promise.all([
      this.prisma.patient.count({ where: { cabinetId } }),
      this.prisma.patient.count({
        where: {
          cabinetId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    return { total, ceMois };
  }

  /**
   * Liste des patients "à relancer" : leur dernier soin remonte à plus de
   * `months` mois et ils n'ont aucun rendez-vous à venir programmé.
   * Sert de base au module Rappels (recall) du cabinet.
   */
  async getRecalls(cabinetId: number, months = 6) {
    const monthsNum = Number(months) > 0 ? Number(months) : 6;
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - monthsNum);

    const patients = await this.prisma.patient.findMany({
      where: { cabinetId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        gsm: true,
        telephoneFixe: true,
        treatments: {
          orderBy: { dateSoin: 'desc' },
          take: 1,
          select: { dateSoin: true },
        },
        appointments: {
          where: {
            dateDebut: { gte: new Date() },
            statut: { not: 'annule' },
          },
          take: 1,
          select: { id: true },
        },
      },
    });

    return patients
      .filter((p) => {
        if (p.appointments.length > 0) return false; // déjà un RDV à venir
        const derniere = p.treatments[0]?.dateSoin;
        if (!derniere) return false; // aucun historique de soin
        return derniere <= threshold;
      })
      .map((p) => {
        const derniereVisite = p.treatments[0].dateSoin;
        const moisEcoules = Math.floor(
          (Date.now() - new Date(derniereVisite).getTime()) / (1000 * 60 * 60 * 24 * 30),
        );
        return {
          id: p.id,
          nom: p.nom,
          prenom: p.prenom,
          gsm: p.gsm,
          telephoneFixe: p.telephoneFixe,
          derniereVisite,
          moisEcoules,
        };
      })
      .sort(
        (a, b) => new Date(a.derniereVisite).getTime() - new Date(b.derniereVisite).getTime(),
      );
  }

    // Bloque la création d'un nouveau patient si le cabinet a déjà atteint
    // la limite de son plan d'abonnement (voir src/billing/plan-limits.ts).
    private async assertSousLaLimite(cabinetId: number) {
          const cabinet = await this.prisma.cabinet.findUnique({
                  where: { id: cabinetId },
          });
          if (!cabinet) return;

          const planKey = isValidPlan(cabinet.plan) ? cabinet.plan : 'starter';
          const maxPatients = PLAN_LIMITS[planKey].maxPatients;
          if (maxPatients === null) return; // illimité

          const total = await this.prisma.patient.count({ where: { cabinetId } });
          if (total >= maxPatients) {
                  throw new ForbiddenException(
                            `Limite de ${maxPatients} patients atteinte pour le plan ${PLAN_LIMITS[planKey].label}. Passez à un plan supérieur pour continuer.`,
                          );
          }
    }
}
