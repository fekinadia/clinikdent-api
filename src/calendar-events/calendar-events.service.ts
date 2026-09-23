import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  ListCalendarEventsQueryDto,
} from './dto/calendar-event.dto';

@Injectable()
export class CalendarEventsService {
  constructor(private prisma: PrismaService) {}

  async create(cabinetId: number, userId: number, dto: CreateCalendarEventDto) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    if (dateFin <= dateDebut) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }

    if (dto.medecinId) {
      await this.assertMedecinInCabinet(cabinetId, dto.medecinId);
    }

    return this.prisma.calendarEvent.create({
      data: {
        cabinetId,
        titre: dto.titre,
        medecinId: dto.medecinId,
        dateDebut,
        dateFin,
        createdById: userId,
      },
    });
  }

  async findAll(cabinetId: number, query: ListCalendarEventsQueryDto) {
    const where: any = { cabinetId };

    if (query.dateDebut) {
      where.dateDebut = { gte: new Date(query.dateDebut) };
    }
    if (query.dateFin) {
      where.dateFin = { lte: new Date(query.dateFin) };
    }

    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { dateDebut: 'asc' },
    });
  }

  async findOne(cabinetId: number, id: number) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.cabinetId !== cabinetId) {
      throw new NotFoundException('Événement introuvable');
    }
    return event;
  }

  async update(cabinetId: number, id: number, dto: UpdateCalendarEventDto) {
    await this.findOne(cabinetId, id);

    if (dto.medecinId) {
      await this.assertMedecinInCabinet(cabinetId, dto.medecinId);
    }

    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...dto,
        dateDebut: dto.dateDebut ? new Date(dto.dateDebut) : undefined,
        dateFin: dto.dateFin ? new Date(dto.dateFin) : undefined,
      },
    });
  }

  async delete(cabinetId: number, id: number) {
    await this.findOne(cabinetId, id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { success: true };
  }

  private async assertMedecinInCabinet(cabinetId: number, medecinId: number) {
    const medecin = await this.prisma.user.findUnique({ where: { id: medecinId } });
    if (!medecin || medecin.cabinetId !== cabinetId) {
      throw new ForbiddenException('Médecin invalide');
    }
  }
}
