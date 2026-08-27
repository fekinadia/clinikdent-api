import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  private async assertPatientDuCabinet(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient introuvable');
    if (patient.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce patient n'appartient pas à votre cabinet");
    }
    return patient;
  }

  async create(cabinetId: number, userId: number, dto: CreateReminderDto) {
    await this.assertPatientDuCabinet(cabinetId, dto.patientId);

    return this.prisma.reminder.create({
      data: {
        cabinetId,
        patientId: dto.patientId,
        dateRappel: new Date(dto.dateRappel),
        note: dto.note,
        createdById: userId,
      },
    });
  }

  async findAll(cabinetId: number, patientId?: number, includeDone = false) {
    const where: any = { cabinetId };
    if (patientId) where.patientId = patientId;
    if (!includeDone) where.termine = false;

    return this.prisma.reminder.findMany({
      where,
      include: {
        patient: { select: { id: true, nom: true, prenom: true, gsm: true } },
      },
      orderBy: { dateRappel: 'asc' },
    });
  }

  async update(cabinetId: number, id: number, dto: UpdateReminderDto) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.cabinetId !== cabinetId) {
      throw new NotFoundException('Rappel introuvable');
    }

    return this.prisma.reminder.update({
      where: { id },
      data: {
        ...(dto.termine !== undefined ? { termine: dto.termine } : {}),
        ...(dto.dateRappel ? { dateRappel: new Date(dto.dateRappel) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  async delete(cabinetId: number, id: number) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.cabinetId !== cabinetId) {
      throw new NotFoundException('Rappel introuvable');
    }
    await this.prisma.reminder.delete({ where: { id } });
    return { success: true };
  }
}
