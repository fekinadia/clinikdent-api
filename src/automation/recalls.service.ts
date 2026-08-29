import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecallDto, UpdateRecallDto } from './dto/recall.dto';

@Injectable()
export class RecallsService {
  constructor(private prisma: PrismaService) {}

  async findAll(cabinetId: number, statut?: string) {
    return this.prisma.recall.findMany({
      where: { cabinetId, ...(statut ? { statut } : {}) },
      include: {
        patient: { select: { id: true, nom: true, prenom: true, gsm: true } },
      },
      orderBy: { dateEcheance: 'asc' },
    });
  }

  async create(cabinetId: number, dto: CreateRecallDto) {
    if (!dto.typeRecallMois && !dto.dateEcheance) {
      throw new BadRequestException(
        'Fournir soit typeRecallMois, soit dateEcheance',
      );
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException('Patient invalide');
    }

    const dateDerniereVisite = dto.dateDerniereVisite
      ? new Date(dto.dateDerniereVisite)
      : new Date();

    let dateEcheance: Date;
    if (dto.dateEcheance) {
      dateEcheance = new Date(dto.dateEcheance);
    } else {
      dateEcheance = new Date(dateDerniereVisite);
      dateEcheance.setMonth(dateEcheance.getMonth() + dto.typeRecallMois);
    }

    return this.prisma.recall.create({
      data: {
        patientId: dto.patientId,
        cabinetId,
        typeRecallMois: dto.typeRecallMois,
        dateDerniereVisite,
        dateEcheance,
        statut: 'a_venir',
      },
    });
  }

  private async assertRecallDuCabinet(cabinetId: number, id: number) {
    const recall = await this.prisma.recall.findUnique({ where: { id } });
    if (!recall) throw new NotFoundException('Recall introuvable');
    if (recall.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce recall n'appartient pas à votre cabinet");
    }
    return recall;
  }

  async update(cabinetId: number, id: number, dto: UpdateRecallDto) {
    await this.assertRecallDuCabinet(cabinetId, id);

    return this.prisma.recall.update({
      where: { id },
      data: {
        ...(dto.typeRecallMois !== undefined ? { typeRecallMois: dto.typeRecallMois } : {}),
        ...(dto.dateEcheance !== undefined
          ? { dateEcheance: new Date(dto.dateEcheance) }
          : {}),
        ...(dto.statut !== undefined ? { statut: dto.statut } : {}),
      },
    });
  }

  async delete(cabinetId: number, id: number) {
    await this.assertRecallDuCabinet(cabinetId, id);
    await this.prisma.recall.delete({ where: { id } });
    return { success: true };
  }
}
