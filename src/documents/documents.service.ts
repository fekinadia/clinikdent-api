import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto, ListDocumentsQueryDto } from './dto/document.dto';

const MEDECIN_SELECT = { nom: true, prenom: true, specialite: true, numeroOrdre: true } as const;
const PATIENT_SELECT_MIN = { id: true, nom: true, prenom: true, numeroDossier: true } as const;

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async create(cabinetId: number, userId: number, dto: CreateDocumentDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce patient n'appartient pas à votre cabinet");
    }

    return this.prisma.document.create({
      data: {
        cabinetId,
        patientId: dto.patientId,
        type: dto.type,
        contenu: dto.contenu,
        montant: dto.montant,
        medecinId: userId,
        createdById: userId,
        dateEmission: dto.dateEmission ? new Date(dto.dateEmission) : new Date(),
      },
      include: {
        patient: { select: { nom: true, prenom: true, numeroDossier: true, dateNaissance: true } },
        medecin: { select: MEDECIN_SELECT },
      },
    });
  }

  async findByPatient(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce patient n'appartient pas à votre cabinet");
    }

    return this.prisma.document.findMany({
      where: { patientId },
      orderBy: { dateEmission: 'desc' },
    });
  }

  async findOne(cabinetId: number, id: number) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        patient: true,
        medecin: { select: MEDECIN_SELECT },
      },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    if (doc.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce document n'appartient pas à votre cabinet");
    }
    return doc;
  }

  /**
   * Liste globale du cabinet, utilisée par la page Documents. Le frontend
   * fusionne cette liste avec GET /prescriptions (ordonnances) pour
   * reconstituer la vue combinée des 5 types de documents (comme Dentalis).
   */
  async findAllByCabinet(cabinetId: number, query: ListDocumentsQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { cabinetId };
    if (query.type) where.type = query.type;
    if (query.search) {
      where.patient = {
        OR: [
          { nom: { contains: query.search, mode: 'insensitive' } },
          { prenom: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dateEmission: 'desc' },
        include: { patient: { select: PATIENT_SELECT_MIN } },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page, pageCount: Math.ceil(total / limit) || 1 };
  }
}
