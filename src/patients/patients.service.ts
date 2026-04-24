import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto, ListPatientsQueryDto } from './dto/patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(cabinetId: number, userId: number, dto: CreatePatientDto) {
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
}
