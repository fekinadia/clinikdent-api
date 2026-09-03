import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto, ListPatientsQueryDto } from './dto/patient.dto';
import { PLAN_LIMITS, isValidPlan } from '../billing/plan-limits';

@Injectable()
  export class PatientsService {
  constructor(private prisma: PrismaService) {}

async create(cabinetId: number, userId: number, dto: CreatePatientDto) {
  await this.assertSousLaLimite(cabinetId);

  const numeroDossierSaisi = dto.numeroDossier?.trim();

  // Numero de dossier saisi manuellement par le medecin : pas de retry,
  // une collision est une vraie erreur a signaler telle quelle.
  if (numeroDossierSaisi) {
       try {
      return await this.prisma.patient.update({
        where: { id },
        data: {
          ...dto,
          dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
          // Toute modification manuelle de la fiche confirme que ce n'est plus
          // un simple prospect créé à la volée depuis l'Agenda.
          estProspect: false,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(this.messageConflitUnicite(e));
      }
      throw e;
    }
  }

  // Numero genere automatiquement : on retente avec le numero suivant en
  // cas de collision, au lieu d'echouer. Une collision peut arriver si un
  // dossier a ete saisi manuellement hors sequence (ex: "DOSSIER-TEST"),
  // ce qui aurait auparavant fausse le calcul du "dernier" numero.
  const MAX_TENTATIVES = 5;
  let numeroDossier = await this.prochainNumeroDossier(cabinetId);

  for (let tentative = 0; tentative < MAX_TENTATIVES; tentative++) {
    try {
      return await this.prisma.patient.create({
        data: {
          ...dto,
          dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
          numeroDossier,
          cabinetId,
          createdById: userId,
        },
      });
    } catch (e: any) {
      if (e.code !== 'P2002') {
        throw e;
      }
      if (!this.estConflitNumeroDossier(e)) {
        throw new ConflictException(this.messageConflitUnicite(e));
      }
      // Le numero genere etait deja pris : on essaie le suivant.
    const n = parseInt(numeroDossier, 10);
      numeroDossier = String((isNaN(n) ? 0 : n) + 1).padStart(5, '0');
    }
  }

  throw new ConflictException(
    "Impossible de generer un numero de dossier disponible, reessayez ou saisissez-en un manuellement.",
    );
}

private async prochainNumeroDossier(cabinetId: number): Promise<string> {
  const patients = await this.prisma.patient.findMany({
    where: { cabinetId },
    select: { numeroDossier: true },
  });

  const max = patients.reduce((acc, p) => {
    if (/^\d+$/.test(p.numeroDossier)) {
      const n = parseInt(p.numeroDossier, 10);
      if (n > acc) return n;
    }
    return acc;
  }, 0);

  return String(max + 1).padStart(5, '0');
}

private estConflitNumeroDossier(e: any): boolean {
  const target: string[] = Array.isArray(e?.meta?.target)
  ? e.meta.target
    : typeof e?.meta?.target === 'string'
  ? [e.meta.target]
    : [];
  return target.some((t) => t.includes('numero_dossier'));
}

private messageConflitUnicite(e: any): string {
  const target: string[] = Array.isArray(e?.meta?.target)
  ? e.meta.target
    : typeof e?.meta?.target === 'string'
  ? [e.meta.target]
    : [];

  if (target.some((t) => t.includes('numero_dossier'))) {
    return 'Ce numero de dossier est deja utilise';
  }
  if (target.some((t) => t.includes('gsm'))) {
    return 'Ce numero de telephone est deja utilise';
  }
  if (target.some((t) => t.includes('email'))) {
    return 'Cette adresse email est deja utilisee';
  }
  return 'Cette information existe deja pour un autre patient';
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
    throw new ForbiddenException("Ce patient n'appartient pas a votre cabinet");
  }

  return patient;
}

async update(cabinetId: number, id: number, dto: UpdatePatientDto) {
  await this.findOne(cabinetId, id); // verifier l'acces

  try {
    return await this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
      },
    });
  } catch (e: any) {
    if (e.code === 'P2002') {
      throw new ConflictException(this.messageConflitUnicite(e));
    }
    throw e;
  }
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
    if (p.appointments.length > 0) return false;
    const derniere = p.treatments[0]?.dateSoin;
    if (!derniere) return false;
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

private async assertSousLaLimite(cabinetId: number) {
  const cabinet = await this.prisma.cabinet.findUnique({
    where: { id: cabinetId },
  });
  if (!cabinet) return;

  const planKey = isValidPlan(cabinet.plan) ? cabinet.plan : 'starter';
  const maxPatients = PLAN_LIMITS[planKey].maxPatients;
  if (maxPatients === null) return;

  const total = await this.prisma.patient.count({ where: { cabinetId } });
  if (total >= maxPatients) {
    throw new ForbiddenException(
      `Limite de ${maxPatients} patients atteinte pour le plan ${PLAN_LIMITS[planKey].label}. Passez a un plan superieur pour continuer.`,
      );
  }
}
}
